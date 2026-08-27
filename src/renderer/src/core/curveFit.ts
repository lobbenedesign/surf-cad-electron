// Least-squares cubic Bezier fit to a set of digitized points (e.g. clicked by
// hand over a trace-image, see referenceImage.ts). Chord-length parametrized,
// endpoints pinned to the first/last digitized point, interior control points
// solved via the normal equations of the standard 2-unknown Bezier fit
// (Graphics Gems I, "An Algorithm for Automatically Fitting Digitized Curves") —
// same math referenced in roadmap.md's `bestFit` note.

import type { Point } from './bezier'
import type { CurveCP } from './types'

function chordLengthParams(points: Point[]): number[] {
  const d = [0]
  for (let i = 1; i < points.length; i++) {
    d.push(d[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const total = d[d.length - 1] || 1
  return d.map((v) => v / total)
}

/**
 * Fits a cubic bezier to `points` (must have >= 2 entries, ideally >= 4 for a
 * meaningful fit). Returns null if the points are too degenerate (all
 * coincident) to solve.
 */
export function bestFitCubicBezier(points: Point[]): CurveCP | null {
  if (points.length < 2) return null
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const p0 = sorted[0]
  const p3 = sorted[sorted.length - 1]
  const t = chordLengthParams(sorted)

  let sC1C1 = 0
  let sC1C2 = 0
  let sC2C2 = 0
  let sC1RhsX = 0
  let sC2RhsX = 0
  let sC1RhsY = 0
  let sC2RhsY = 0

  for (let i = 0; i < sorted.length; i++) {
    const ti = t[i]
    const mt = 1 - ti
    const c0 = mt * mt * mt
    const c1 = 3 * mt * mt * ti
    const c2 = 3 * mt * ti * ti
    const c3 = ti * ti * ti

    const rhsX = sorted[i].x - c0 * p0.x - c3 * p3.x
    const rhsY = sorted[i].y - c0 * p0.y - c3 * p3.y

    sC1C1 += c1 * c1
    sC1C2 += c1 * c2
    sC2C2 += c2 * c2
    sC1RhsX += c1 * rhsX
    sC2RhsX += c2 * rhsX
    sC1RhsY += c1 * rhsY
    sC2RhsY += c2 * rhsY
  }

  // Solve the 2x2 normal-equations system [sC1C1 sC1C2; sC1C2 sC2C2] * [P1;P2] = rhs, per axis.
  const det = sC1C1 * sC2C2 - sC1C2 * sC1C2
  if (Math.abs(det) < 1e-9) return null

  const p1x = (sC2C2 * sC1RhsX - sC1C2 * sC2RhsX) / det
  const p2x = (sC1C1 * sC2RhsX - sC1C2 * sC1RhsX) / det
  const p1y = (sC2C2 * sC1RhsY - sC1C2 * sC2RhsY) / det
  const p2y = (sC1C1 * sC2RhsY - sC1C2 * sC1RhsY) / det

  return [
    { x: p0.x, y: p0.y },
    { x: p1x, y: p1y },
    { x: p2x, y: p2y },
    { x: p3.x, y: p3.y }
  ]
}
