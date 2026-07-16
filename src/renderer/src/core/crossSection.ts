// Cross-section (rail) profile model.
// Each station holds a HALF profile: an ordered path in normalized (u, v) space
// from bottom-center (u=0) out to the rail edge (u=1) and back to deck-center (u=0).
// Mirroring u -> -u closes the full rail loop for rendering/lofting.

import type { Point } from './bezier'
import { catmullRomSample } from './spline'

export interface CrossSectionStation {
  /** 0 = nose tip, 1 = tail tip. */
  position: number
  /** Half-profile control points, ordered bottom-center -> rail -> deck-center. */
  points: Point[]
}

export const DEFAULT_STATION_POSITIONS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]

/** A rounded-rail half profile (bottom flatter, deck domed) sampled from the previous formula-based shape. */
export function defaultHalfProfile(): Point[] {
  return [
    { x: 0, y: 0.4 },
    { x: 0.71, y: 0.429 },
    { x: 1, y: 0.5 },
    { x: 0.71, y: 0.854 },
    { x: 0, y: 1.0 }
  ]
}

export function defaultCrossSections(): CrossSectionStation[] {
  return DEFAULT_STATION_POSITIONS.map((position) => ({
    position,
    points: defaultHalfProfile().map((p) => ({ ...p }))
  }))
}

/** Linearly blends control points (index-aligned) of the two stations nearest to `t`. */
export function interpolateStationPoints(stations: CrossSectionStation[], t: number): Point[] {
  const sorted = [...stations].sort((a, b) => a.position - b.position)
  if (t <= sorted[0].position) return sorted[0].points
  if (t >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].points

  let lo = sorted[0]
  let hi = sorted[sorted.length - 1]
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].position <= t && t <= sorted[i + 1].position) {
      lo = sorted[i]
      hi = sorted[i + 1]
      break
    }
  }
  const span = hi.position - lo.position
  const f = span < 1e-6 ? 0 : (t - lo.position) / span

  // Normal UI usage (add/remove point in CrossSectionEditor) keeps every station's
  // point count in lockstep, but nothing enforces that structurally — an import, a
  // future per-station edit, or a bad file could still leave two neighboring
  // stations with different counts. Resample both to a common count via the same
  // Catmull-Rom sampler used everywhere else instead of truncating the richer one
  // down (which silently threw away detail and could misalign index i between
  // stations, blending unrelated points together).
  const n = Math.max(lo.points.length, hi.points.length, 2)
  const loPts = lo.points.length === n ? lo.points : catmullRomSample(lo.points, n)
  const hiPts = hi.points.length === n ? hi.points : catmullRomSample(hi.points, n)

  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: loPts[i].x + (hiPts[i].x - loPts[i].x) * f,
      y: loPts[i].y + (hiPts[i].y - loPts[i].y) * f
    })
  }
  return out
}

/** Samples a half profile into a smooth curve, then mirrors it into a closed full-rail loop (u: -1..1). */
export function buildFullRailLoop(halfPoints: Point[], samplesPerHalf = 24): Point[] {
  const half = catmullRomSample(halfPoints, samplesPerHalf)
  const mirrored = [...half].reverse().map((p) => ({ x: -p.x, y: p.y }))
  return [...half, ...mirrored]
}
