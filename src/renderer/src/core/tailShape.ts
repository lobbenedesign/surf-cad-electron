import type { Point } from './bezier'
import { interp, resampleOnX } from './bezier'
import type { TailShape } from './types'

/**
 * Reshapes the tail portion of a half-outline curve (top view) to reflect the
 * chosen tail preset. `samples` must be ordered by ascending x (nose -> tail).
 * For 'swallow' the result is intentionally non-monotonic in x near the tail
 * (the two tips fork backwards) — fine for 2D path drawing, not for the
 * x-indexed mesh loft (see meshGenerator, which handles swallow separately).
 */
export function applyTailToOutline(samples: Point[], length: number, tail: TailShape): Point[] {
  if (tail.type === 'square') {
    const squareLen = Math.min(8, length * 0.05)
    const x0 = length - squareLen
    const xp = samples.map((p) => p.x)
    const fp = samples.map((p) => p.y)
    const w0 = interp(x0, xp, fp)
    const kept = samples.filter((p) => p.x <= x0)
    return [...kept, { x: x0, y: w0 }, { x: length, y: w0 }]
  }

  if (tail.type === 'swallow') {
    const region = Math.max(tail.swallowDepth * 1.4, 6)
    const x0 = Math.max(length - region, length * 0.5)
    const xp = samples.map((p) => p.x)
    const fp = samples.map((p) => p.y)
    const w0 = interp(x0, xp, fp)
    const kept = samples.filter((p) => p.x <= x0)
    const tipHalf = tail.tipToTipWidth / 2
    const notchX = Math.max(length - tail.swallowDepth, x0)
    return [...kept, { x: x0, y: w0 }, { x: length, y: tipHalf }, { x: notchX, y: 0 }]
  }

  // round / pin / squash: shape comes from the outline curve's own tail control point.
  return samples
}

/** Half-width at a given x, sampling the (possibly tail-reshaped) outline. */
export function widthAtX(samples: Point[], x: number): number {
  return resampleOnX(samples, [x])[0]
}
