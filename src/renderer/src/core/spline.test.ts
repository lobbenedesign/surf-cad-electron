import { describe, expect, it } from 'vitest'
import { catmullRomSample } from './spline'
import type { Point } from './bezier'

describe('catmullRomSample', () => {
  it('returns exactly `steps` samples', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
      { x: 3, y: 2 }
    ]
    const out = catmullRomSample(points, 33)
    expect(out).toHaveLength(33)
  })

  it('starts and ends at the first and last control point', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: -3 },
      { x: 4, y: 1 }
    ]
    const out = catmullRomSample(points, 50)
    expect(out[0].x).toBeCloseTo(points[0].x, 10)
    expect(out[0].y).toBeCloseTo(points[0].y, 10)
    expect(out[out.length - 1].x).toBeCloseTo(points[points.length - 1].x, 10)
    expect(out[out.length - 1].y).toBeCloseTo(points[points.length - 1].y, 10)
  })

  it('passes exactly through every interior control point on the parametrized grid', () => {
    // With 4 points (3 segments) and steps = 3*segCount + 1, the sample grid
    // lands exactly on every original control point (u integer => t=0).
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 3 },
      { x: 2, y: -2 },
      { x: 3, y: 4 }
    ]
    const steps = 3 * (points.length - 1) + 1 // 10
    const out = catmullRomSample(points, steps)
    for (let i = 0; i < points.length; i++) {
      const sampleIndex = i * 3
      expect(out[sampleIndex].x).toBeCloseTo(points[i].x, 6)
      expect(out[sampleIndex].y).toBeCloseTo(points[i].y, 6)
    }
  })

  it('reduces to a straight line for collinear, evenly-spaced points', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 }
    ]
    const out = catmullRomSample(points, 25)
    for (const p of out) {
      expect(p.y).toBeCloseTo(p.x, 6)
    }
  })

  it('handles the degenerate 2-point case as a direct pass-through', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 }
    ]
    expect(catmullRomSample(points, 1)).toEqual(points)
  })
})
