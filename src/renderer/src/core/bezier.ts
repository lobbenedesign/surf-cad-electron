// Ported from BoardCAD-2026/src/core/bezier.py

export interface Point {
  x: number
  y: number
}

export function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

/** Returns `steps` points sampled along the cubic bezier defined by 4 control points. */
export function evaluateCurve(p0: Point, p1: Point, p2: Point, p3: Point, steps = 100): Point[] {
  const curve: Point[] = new Array(steps)
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    curve[i] = {
      x: cubicBezier(t, p0.x, p1.x, p2.x, p3.x),
      y: cubicBezier(t, p0.y, p1.y, p2.y, p3.y)
    }
  }
  return curve
}

/**
 * Evaluates a chained multi-segment path (length 3k+1: anchors at every 3rd
 * index, the two points between are that segment's handles) into x-ascending
 * samples. `stepsPerSegment` applies per segment; segment boundaries aren't
 * duplicated. A plain 4-point curve (k=1) behaves identically to evaluateCurve.
 */
export function evaluatePath(path: Point[], stepsPerSegment = 100): Point[] {
  const segCount = Math.max(1, Math.round((path.length - 1) / 3))
  const out: Point[] = []
  for (let s = 0; s < segCount; s++) {
    const base = s * 3
    const seg = evaluateCurve(path[base], path[base + 1], path[base + 2], path[base + 3], stepsPerSegment)
    out.push(...(s === 0 ? seg : seg.slice(1)))
  }
  return out
}

/** Linear interpolation equivalent to numpy.interp: xp must be sorted ascending. */
export function interp(x: number, xp: number[], fp: number[]): number {
  const n = xp.length
  if (x <= xp[0]) return fp[0]
  if (x >= xp[n - 1]) return fp[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xp[mid] <= x) lo = mid
    else hi = mid
  }
  const t = (x - xp[lo]) / (xp[hi] - xp[lo])
  return fp[lo] + t * (fp[hi] - fp[lo])
}

/** Resamples a (possibly x-unsorted) curve onto a common ascending x grid. */
export function resampleOnX(curve: Point[], commonX: number[]): number[] {
  const sorted = [...curve].sort((a, b) => a.x - b.x)
  const xp = sorted.map((p) => p.x)
  const fp = sorted.map((p) => p.y)
  return commonX.map((x) => interp(x, xp, fp))
}
