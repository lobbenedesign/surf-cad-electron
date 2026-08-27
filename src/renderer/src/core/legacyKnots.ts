// Shared conversion between a legacy CAD file's "knot" representation (an
// anchor point plus its two owned tangent handles — the universal shape a
// `.brd`, `.s3d`/`.s3dx`, or `.srf` reader all parse into) and this app's own
// curve types: OutlinePath (variable-length, lossless for any knot count) and
// CurveCP (rocker/deck's fixed 4-point curve, lossless only for exactly 2
// knots — anything richer gets least-squares-fit down to one bezier segment).

import type { Point } from './bezier'
import { evaluatePath } from './bezier'
import { bestFitCubicBezier } from './curveFit'
import type { CurveCP } from './types'

export interface LegacyKnot {
  anchor: Point
  handleIn: Point
  handleOut: Point
}

/** Chains knots into our multi-segment path format: anchor, handleOut, handleIn, anchor, ... */
export function knotsToPath(knots: LegacyKnot[]): Point[] {
  const path: Point[] = [knots[0].anchor]
  for (let i = 0; i < knots.length - 1; i++) {
    path.push(knots[i].handleOut, knots[i + 1].handleIn, knots[i + 1].anchor)
  }
  return path
}

/** Rocker/deck are fixed 4-point curves in this app — a 2-knot record maps across losslessly, anything else gets least-squares-fit down to one bezier segment (`curveFit.ts`, already used for the Digitalizza tool), with a warning pushed onto `warnings`. */
export function knotsToCurveCP(knots: LegacyKnot[], label: string, fallback: CurveCP, warnings: string[]): CurveCP {
  if (knots.length === 0) {
    warnings.push(`Curva ${label} assente nel file — usata la curva di default.`)
    return fallback
  }
  if (knots.length === 1) {
    warnings.push(`Curva ${label} degenere (un solo punto) nel file — usata la curva di default.`)
    return fallback
  }
  if (knots.length === 2) {
    const path = knotsToPath(knots)
    return [path[0], path[1], path[2], path[3]]
  }
  const sampled = evaluatePath(knotsToPath(knots), 100)
  const fitted = bestFitCubicBezier(sampled)
  if (!fitted) {
    warnings.push(`Curva ${label} non interpretabile nel file — usata la curva di default.`)
    return fallback
  }
  warnings.push(
    `Curva ${label} aveva ${knots.length} punti di controllo nel file originale — approssimata a una singola curva bezier (l'editor Rocker/Deck di questa app usa 4 punti fissi).`
  )
  return fitted
}
