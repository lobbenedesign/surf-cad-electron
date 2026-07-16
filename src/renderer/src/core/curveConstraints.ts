// Control-point continuity/constraints — scoped v1 (see roadmap.md §3.2).
//
// The full model researched from OpenShaper (per-axis drag masks, 4-bit tangent
// locks, slave/shared endpoints) assumes an anchor+handle curve representation.
// Our curves are a plain 4-point cubic bezier edited by dragging the points
// directly, so that model doesn't map on 1:1 without first restructuring the
// curve type everywhere it's used (meshGenerator, tailShape, boardTemplates,
// measurements...). Rather than force that rewrite in to land this, v1 delivers
// the single highest-value guarantee on the model we actually have: an outline/
// rocker/deck curve can never fold back on itself in x (P0.x <= P1.x <= P2.x <=
// P3.x), which is what actually produces broken/self-intersecting board
// geometry today if an interior point gets dragged past its neighbor. Endpoints
// (index 0 and 3) are already x-locked to the nose/tail station by the callers,
// so only the two interior points need clamping here.

import type { CurveCP } from './types'

/** Clamps the just-dragged interior point (index 1 or 2) so x stays between its neighbors. */
export function clampCurveMonotonic(points: CurveCP, draggedIndex: number): CurveCP {
  if (draggedIndex !== 1 && draggedIndex !== 2) return points
  const pts = points.map((p) => ({ ...p })) as CurveCP
  if (draggedIndex === 1) {
    pts[1].x = clamp(pts[1].x, pts[0].x, pts[2].x)
  } else {
    pts[2].x = clamp(pts[2].x, pts[1].x, pts[3].x)
  }
  return pts
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi))
}

/** True if a curve's interior points are already in non-decreasing x order (no fold). */
export function isCurveMonotonic(points: CurveCP): boolean {
  return points[0].x <= points[1].x && points[1].x <= points[2].x && points[2].x <= points[3].x
}
