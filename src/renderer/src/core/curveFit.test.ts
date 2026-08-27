import { describe, expect, it } from 'vitest'
import { bestFitCubicBezier } from './curveFit'
import { evaluateCurve } from './bezier'
import type { Point } from './bezier'

describe('bestFitCubicBezier', () => {
  it('returns null when given fewer than 2 points', () => {
    expect(bestFitCubicBezier([])).toBeNull()
    expect(bestFitCubicBezier([{ x: 0, y: 0 }])).toBeNull()
  })

  it('returns null for degenerate (all coincident) points', () => {
    const points: Point[] = Array.from({ length: 5 }, () => ({ x: 3, y: 3 }))
    expect(bestFitCubicBezier(points)).toBeNull()
  })

  it('recovers the original control points from points densely sampled off a known bezier', () => {
    // Chord-length parametrization is itself an approximation of the bezier's
    // true (non-arc-length) parametrization, so exact recovery only holds for
    // curves whose speed doesn't vary wildly with t. Kept mild here on purpose.
    const p0: Point = { x: 0, y: 0 }
    const p1: Point = { x: 3, y: 2 }
    const p2: Point = { x: 7, y: -1 }
    const p3: Point = { x: 10, y: 0 }
    const sampled = evaluateCurve(p0, p1, p2, p3, 60)

    const fit = bestFitCubicBezier(sampled)
    expect(fit).not.toBeNull()
    const [fp0, fp1, fp2, fp3] = fit!

    // Endpoints are pinned exactly to the first/last (x-sorted) input point.
    expect(fp0.x).toBeCloseTo(p0.x, 6)
    expect(fp0.y).toBeCloseTo(p0.y, 6)
    expect(fp3.x).toBeCloseTo(p3.x, 6)
    expect(fp3.y).toBeCloseTo(p3.y, 6)

    // Interior control points are recovered to within a fraction of a unit
    // since the samples were generated from an exact bezier with no noise.
    expect(fp1.x).toBeCloseTo(p1.x, 0)
    expect(fp1.y).toBeCloseTo(p1.y, 0)
    expect(fp2.x).toBeCloseTo(p2.x, 0)
    expect(fp2.y).toBeCloseTo(p2.y, 0)
  })

  it('re-evaluating the fitted curve closely reproduces the sampled points (round-trip)', () => {
    const p0: Point = { x: 0, y: 0 }
    const p1: Point = { x: 3, y: 2 }
    const p2: Point = { x: 7, y: -1 }
    const p3: Point = { x: 10, y: 0 }
    const sampled = evaluateCurve(p0, p1, p2, p3, 40)

    const fit = bestFitCubicBezier(sampled)!
    const refit = evaluateCurve(fit[0], fit[1], fit[2], fit[3], 40)

    for (let i = 0; i < sampled.length; i++) {
      expect(refit[i].x).toBeCloseTo(sampled[i].x, 0)
      expect(refit[i].y).toBeCloseTo(sampled[i].y, 0)
    }
  })
})
