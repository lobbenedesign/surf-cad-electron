// Control-point continuity/constraints — v1/v2/v3 (see roadmap.md §3.2).
//
// The full model researched from OpenShaper's legacy-Java-derived spec (per-axis
// drag masks, 4-bit tangent locks, slave/shared endpoints) assumes an anchor+
// handle curve representation — a knot is one anchor point plus two independently
// owned handles (toPrev/toNext). Our rocker/deck curves are a plain 4-point cubic
// bezier [P0,P1,P2,P3], but for a *single-segment* curve that's already exactly
// an anchor+handle pair at each end: P0 is the nose anchor with one owned handle
// P1, P3 is the tail anchor with one owned handle P2 — no restructuring needed to
// apply the same tangent-lock semantics OpenShaper's spec describes, just for the
// one-segment case (full multi-knot masks/slave-by-translation are a larger
// rewrite, not done here — v1 monotonicity + v2 slave-endpoint-Y already cover
// the other two documented mechanisms, see below).
//
// v1 delivers the single highest-value guarantee on the model we actually have:
// an outline/rocker/deck curve can never fold back on itself in x (P0.x <= P1.x
// <= P2.x <= P3.x), which is what actually produces broken/self-intersecting
// board geometry today if an interior point gets dragged past its neighbor.
// Endpoints (index 0 and 3) are already x-locked to the nose/tail station by the
// callers, so only the two interior points need clamping here.

import { evaluateCurve, evaluatePath } from './bezier'
import type { Point } from './bezier'
import type { CurveCP } from './types'

/**
 * Clamps the just-dragged interior point (any index strictly between the
 * path's first and last) so its x stays between its immediate neighbors —
 * generalized from the original fixed-4-point version to any path length, so
 * it works unchanged for rocker/deck (always 4 points) and for the outline's
 * now-variable-length path alike.
 */
export function clampCurveMonotonic(points: Point[], draggedIndex: number): Point[] {
  if (draggedIndex <= 0 || draggedIndex >= points.length - 1) return points
  const pts = points.map((p) => ({ ...p }))
  pts[draggedIndex].x = clamp(pts[draggedIndex].x, pts[draggedIndex - 1].x, pts[draggedIndex + 1].x)
  return pts
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi))
}

/** True if a path's points are already in non-decreasing x order (no fold). */
export function isCurveMonotonic(points: Point[]): boolean {
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].x > points[i].x) return false
  }
  return true
}

// v2: rocker/deck endpoints are "slaved" to each other at the nose and tail —
// per the OpenShaper reference model (§3.2, roadmap.md line 99: "deck/bottom
// endpoints x-locked y-free... share nose+tail via mutual slave"), moving one
// curve's tip should move the other's tip by the same delta, preserving the
// board's actual thickness there instead of forcing them equal (they aren't:
// a nose has ~0.5cm of real thickness, not zero).

/** Shifts `other`'s nose/tail Y by however much `changed` moved at that endpoint, relative to `prevChanged`. */
export function slaveEndpointY(prevChanged: CurveCP, changed: CurveCP, other: CurveCP): CurveCP {
  const deltaNose = changed[0].y - prevChanged[0].y
  const deltaTail = changed[3].y - prevChanged[3].y
  if (deltaNose === 0 && deltaTail === 0) return other
  const pts = other.map((p) => ({ ...p })) as CurveCP
  pts[0].y += deltaNose
  pts[3].y += deltaTail
  return pts
}

// C2 warning. Two earlier metrics were tried and measured against real cases:
// (1) control-polygon turning angle over-triggers — the built-in Fish template
// turns its polygon 51° at the tail while its sampled curve is perfectly smooth
// (false positive found in live testing); (2) per-sampled-segment turning angle
// UNDER-triggers — near a cusp the parameter samples bunch up in space (speed
// → 0), so even a curve that fully reverses direction turns only ~13° per
// sample pair (measured). What a shaper perceives as a kink is direction change
// concentrated in a short physical stretch of curve, so the metric is turn
// accumulated over a fixed arc-length window. Calibrated on measured cases at
// this sampling density (values converge for N≥200): built-in Fish outline
// 5°/3cm, deliberately tight nose 18°/3cm, near-cusp fold 50°/3cm — 35° sits
// with ~2x margin above the worst legitimate curve and well below a real fold.
// Sampling must be dense enough that a 3cm window spans several segments on a
// board-length curve (~250cm), or the window degenerates to a single turn.
const KINK_SAMPLES = 200
const KINK_WINDOW_CM = 3
const KINK_WINDOW_TURN_RAD = (35 * Math.PI) / 180
const MIN_SEG_LENGTH = 1e-6

/**
 * True if the sampled curve's direction changes more than ~35° within any 3cm
 * stretch — a visible kink/cusp on a real-scale board, not a smooth curve.
 * Accepts any path length (samples per segment scaled so a multi-segment
 * outline keeps the same overall sampling density this was calibrated at).
 */
export function hasSharpKink(points: Point[]): boolean {
  const segCount = Math.max(1, Math.round((points.length - 1) / 3))
  const samples =
    segCount === 1
      ? evaluateCurve(points[0], points[1], points[2], points[3], KINK_SAMPLES)
      : evaluatePath(points, Math.max(2, Math.round(KINK_SAMPLES / segCount)))
  const segs: { angle: number; len: number }[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const dx = samples[i + 1].x - samples[i].x
    const dy = samples[i + 1].y - samples[i].y
    const len = Math.hypot(dx, dy)
    if (len < MIN_SEG_LENGTH) continue
    segs.push({ angle: Math.atan2(dy, dx), len })
  }
  const turns: number[] = []
  for (let i = 1; i < segs.length; i++) {
    let d = Math.abs(segs[i].angle - segs[i - 1].angle)
    if (d > Math.PI) d = 2 * Math.PI - d
    turns.push(d)
  }
  for (let i = 0; i < turns.length; i++) {
    let turnAcc = 0
    let lenAcc = 0
    for (let j = i; j < turns.length && lenAcc < KINK_WINDOW_CM; j++) {
      turnAcc += turns[j]
      lenAcc += segs[j + 1].len
      if (turnAcc > KINK_WINDOW_TURN_RAD) return true
    }
  }
  return false
}

// v3: 4-bit tangent-lock, from OpenShaper's spec (docs/specs/junction-constraints.md,
// describing the original legacy Java's per-handle lock words). Each bit clamps the
// handle's coordinate against its *own owning anchor's* coordinate, one-sided:
// xMore = handle's x can't go below the anchor's x (pushed up to match if it dips
// under); xLess = can't go above (pulled down); same idea for y. Opt-in per curve
// (off by default — existing free-drag behavior is unchanged unless the user turns
// a lock on), applied only to the two endpoint-adjacent handles (P1 vs anchor P0,
// P2 vs anchor P3) since those are the only handle/anchor pairs a plain 4-point
// curve actually has.
export interface TangentLock {
  xMore: boolean
  xLess: boolean
  yMore: boolean
  yLess: boolean
}

export const NO_TANGENT_LOCK: TangentLock = { xMore: false, xLess: false, yMore: false, yLess: false }

/**
 * A single "blocca" toggle some UIs expose instead of 4 separate checkboxes.
 * Locks *y only* (both directions — the handle can't dip below or rise above
 * its anchor's elevation), leaving x free: the classic CAD "flat tangent" at
 * an endpoint, which is what actually matters for rocker/deck (elevation
 * curves) — it stops the handle from producing an unnatural upward/downward
 * hook right at the nose/tail. Locking x too would pin the handle to the
 * anchor's exact x (a vertical tangent), which isn't a useful default.
 */
export function fullTangentLock(locked: boolean): TangentLock {
  return locked ? { xMore: false, xLess: false, yMore: true, yLess: true } : NO_TANGENT_LOCK
}

/** Clamps `handle` against `anchor` per the locked axes/directions. No-op (returns `handle` unchanged) if every bit is false. */
export function applyTangentLock(handle: Point, anchor: Point, lock: TangentLock): Point {
  if (!lock.xMore && !lock.xLess && !lock.yMore && !lock.yLess) return handle
  let { x, y } = handle
  if (lock.xMore) x = Math.max(x, anchor.x)
  if (lock.xLess) x = Math.min(x, anchor.x)
  if (lock.yMore) y = Math.max(y, anchor.y)
  if (lock.yLess) y = Math.min(y, anchor.y)
  return { x, y }
}
