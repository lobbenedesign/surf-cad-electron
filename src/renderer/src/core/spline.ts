import type { Point } from './bezier'

/** Catmull-Rom through an ordered set of points (not closed). Always returns exactly `steps` samples. */
export function catmullRomSample(points: Point[], steps: number): Point[] {
  if (points.length < 2 || steps < 2) return [...points]

  const get = (i: number): Point => points[Math.max(0, Math.min(points.length - 1, i))]
  const segCount = points.length - 1
  const out: Point[] = []

  for (let i = 0; i < steps; i++) {
    const u = (i / (steps - 1)) * segCount
    const seg = Math.min(Math.floor(u), segCount - 1)
    const t = u - seg

    const p0 = get(seg - 1)
    const p1 = get(seg)
    const p2 = get(seg + 1)
    const p3 = get(seg + 2)

    const t2 = t * t
    const t3 = t2 * t
    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    out.push({ x, y })
  }
  return out
}
