import { describe, it, expect } from 'vitest'
import { cubicBezier, evaluateCurve, evaluatePath, interp, resampleOnX } from './bezier'

describe('cubicBezier', () => {
  it('returns p0 at t=0 and p3 at t=1', () => {
    expect(cubicBezier(0, 10, 20, 30, 40)).toBe(10)
    expect(cubicBezier(1, 10, 20, 30, 40)).toBe(40)
  })

  it('reduces to a straight line when control points are collinear/evenly spaced', () => {
    // p0..p3 evenly spaced -> the cubic Bezier degenerates to linear interpolation.
    expect(cubicBezier(0.5, 0, 10, 20, 30)).toBeCloseTo(15, 10)
  })
})

describe('evaluateCurve', () => {
  it('samples `steps` points starting at p0 and ending at p3', () => {
    const p0 = { x: 0, y: 0 }
    const p1 = { x: 1, y: 5 }
    const p2 = { x: 2, y: -5 }
    const p3 = { x: 3, y: 0 }
    const curve = evaluateCurve(p0, p1, p2, p3, 50)
    expect(curve).toHaveLength(50)
    expect(curve[0]).toEqual(p0)
    expect(curve[49].x).toBeCloseTo(p3.x, 10)
    expect(curve[49].y).toBeCloseTo(p3.y, 10)
  })
})

describe('evaluatePath', () => {
  it('behaves identically to evaluateCurve for a single 4-point segment (k=1)', () => {
    const p0 = { x: 0, y: 0 }
    const p1 = { x: 1, y: 2 }
    const p2 = { x: 2, y: -2 }
    const p3 = { x: 3, y: 0 }
    const single = evaluateCurve(p0, p1, p2, p3, 20)
    const path = evaluatePath([p0, p1, p2, p3], 20)
    expect(path).toEqual(single)
  })

  it('does not duplicate the shared anchor point between two chained segments', () => {
    // 7 points = 2 segments (3*2+1); each evaluateCurve call would independently
    // include the segment boundary, so a naive concat would duplicate it.
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 0 }, // shared anchor between segment 1 and 2
      { x: 4, y: -1 },
      { x: 5, y: -1 },
      { x: 6, y: 0 }
    ]
    const stepsPerSegment = 10
    const out = evaluatePath(path, stepsPerSegment)
    expect(out).toHaveLength(stepsPerSegment * 2 - 1)
    expect(out[0]).toEqual(path[0])
    expect(out[out.length - 1].x).toBeCloseTo(path[6].x, 10)
  })
})

describe('interp', () => {
  const xp = [0, 10, 20]
  const fp = [0, 100, 50]

  it('interpolates linearly between two known points', () => {
    expect(interp(5, xp, fp)).toBeCloseTo(50, 10)
    expect(interp(15, xp, fp)).toBeCloseTo(75, 10)
  })

  it('clamps to the endpoint values outside the domain', () => {
    expect(interp(-5, xp, fp)).toBe(0)
    expect(interp(25, xp, fp)).toBe(50)
  })

  it('returns the exact sample value at a known x', () => {
    expect(interp(10, xp, fp)).toBe(100)
  })
})

describe('resampleOnX', () => {
  it('resamples an x-unsorted curve onto a common ascending grid', () => {
    // Deliberately out of x-order, as a curve traced by hand could be.
    const curve = [
      { x: 10, y: 100 },
      { x: 0, y: 0 },
      { x: 20, y: 50 }
    ]
    const result = resampleOnX(curve, [0, 5, 10, 20])
    expect(result[0]).toBe(0)
    expect(result[1]).toBeCloseTo(50, 10)
    expect(result[2]).toBe(100)
    expect(result[3]).toBe(50)
  })
})
