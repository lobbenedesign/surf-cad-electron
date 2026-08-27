// Volume Wizard: solve for a single dimension (length/width/thickness) that hits
// a target volume, holding the curve *shape* fixed and scaling it uniformly.
// Confirmed greenfield in the roadmap research (no reference implementation in
// either OpenShaper or Surf-Shaper) — bisection against the existing volume
// estimator rather than a closed-form solve, since volume isn't perfectly linear
// in any one dimension once rocker/tail-shape interactions are involved.

import { estimateVolumeLiters } from './measurements'
import type { Point } from './bezier'
import type { BoardState, CurveCP } from './types'

export type VolumeDimension = 'length' | 'width' | 'thickness'

function scalePoints<T extends Point[]>(points: T, axis: 'x' | 'y', factor: number): T {
  return points.map((p) => (axis === 'x' ? { x: p.x * factor, y: p.y } : { x: p.x, y: p.y * factor })) as T
}

export function scaleBoardDimension(board: BoardState, dim: VolumeDimension, factor: number): BoardState {
  if (dim === 'length') {
    return {
      ...board,
      length: board.length * factor,
      outline: scalePoints(board.outline, 'x', factor),
      outlineOpposite: board.outlineOpposite ? scalePoints(board.outlineOpposite, 'x', factor) : undefined,
      rocker: scalePoints(board.rocker, 'x', factor),
      deck: scalePoints(board.deck, 'x', factor),
      tailShape: { ...board.tailShape, swallowDepth: board.tailShape.swallowDepth * factor }
    }
  }
  if (dim === 'width') {
    return {
      ...board,
      width: board.width * factor,
      outline: scalePoints(board.outline, 'y', factor),
      outlineOpposite: board.outlineOpposite ? scalePoints(board.outlineOpposite, 'y', factor) : undefined,
      tailShape: { ...board.tailShape, tipToTipWidth: board.tailShape.tipToTipWidth * factor }
    }
  }
  // thickness: scale the deck curve's height above the rocker (bottom stays put).
  const scaledDeck = board.deck.map((p, i) => {
    const rockerY = board.rocker[i].y
    return { x: p.x, y: rockerY + (p.y - rockerY) * factor }
  }) as CurveCP
  return { ...board, thickness: board.thickness * factor, deck: scaledDeck }
}

/** Finds the scale factor (bounded [0.2, 5]) on `dim` that makes estimateVolumeLiters hit `targetLiters`. */
export function solveForVolume(board: BoardState, dim: VolumeDimension, targetLiters: number): BoardState {
  let lo = 0.2
  let hi = 5
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const v = estimateVolumeLiters(scaleBoardDimension(board, dim, mid))
    if (v < targetLiters) lo = mid
    else hi = mid
  }
  return scaleBoardDimension(board, dim, (lo + hi) / 2)
}
