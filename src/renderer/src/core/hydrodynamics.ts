import type { BoardState } from './types'
import type { Point } from './bezier'
import { evaluateCurve, evaluatePath, resampleOnX } from './bezier'
import { interpolateStationPoints, buildFullRailLoop } from './crossSection'
import { deckStepOffsetAt } from './deckStep'

/** Computes the 2D planform projected area of the outline in cm^2. */
export function computePlanformArea(board: BoardState): number {
  const outlineCurve = evaluatePath(board.outline, 100)
  let area = 0
  for (let i = 0; i < outlineCurve.length - 1; i++) {
    const p1 = outlineCurve[i]
    const p2 = outlineCurve[i + 1]
    const dx = Math.abs(p2.x - p1.x)
    const avgY = (p1.y + p2.y) / 2
    area += dx * avgY
  }
  // Mirror for full width if symmetric, or add left outline if asymmetric
  if (board.outlineSymmetric) {
    return area * 2
  } else {
    let oppositeArea = 0
    const oppPath = evaluatePath(board.outlineOpposite ?? board.outline, 100)
    for (let i = 0; i < oppPath.length - 1; i++) {
      const p1 = oppPath[i]
      const p2 = oppPath[i + 1]
      const dx = Math.abs(p2.x - p1.x)
      const avgY = (p1.y + p2.y) / 2
      oppositeArea += dx * avgY
    }
    return area + oppositeArea
  }
}

/** Builds the closed 2D polygon of the cross section in world cm at a given station x. */
export function getCrossSectionPolygon(board: BoardState, x: number, samplesPerHalf = 24): Point[] {
  const { outline, outlineOpposite, outlineSymmetric, rocker, deck, deckStep, length, crossSections } = board
  if (length <= 0) return []

  const outlineCurve = evaluatePath(outline, 100)
  const rockerCurve = evaluateCurve(...rocker, 100)
  const deckCurve = evaluateCurve(...deck, 100)

  const wRight = Math.max(resampleOnX(outlineCurve, [x])[0], 0.1)
  const wLeft = outlineSymmetric ? wRight : Math.max(resampleOnX(evaluatePath(outlineOpposite ?? outline, 100), [x])[0], 0.1)
  const cz = resampleOnX(rockerCurve, [x])[0]
  const dStep = deckStep ? deckStepOffsetAt(deckStep, x, length) : 0
  const deckZ = resampleOnX(deckCurve, [x])[0] + dStep
  const h = Math.max(deckZ - cz, 0.1)

  const t = x / length
  const halfPts = interpolateStationPoints(crossSections, t)
  const loop = buildFullRailLoop(halfPts, samplesPerHalf)

  // Scale the normalized loop into world coordinates
  return loop.map((p) => {
    const w = p.x >= 0 ? wRight : wLeft
    return {
      x: p.x * w,
      y: cz + p.y * h
    }
  })
}

/** Computes the cross-sectional area in cm^2 at a given longitudinal position x. */
export function computeCrossSectionalArea(board: BoardState, x: number): number {
  const poly = getCrossSectionPolygon(board, x)
  if (poly.length < 3) return 0
  // Shoelace formula for polygon area
  let sum = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n
    sum += poly[i].x * poly[next].y - poly[next].x * poly[i].y
  }
  return Math.abs(sum) * 0.5
}

/** Computes the bottom wetted perimeter length in cm at a given station x. */
export function computeBottomPerimeter(board: BoardState, x: number): number {
  const poly = getCrossSectionPolygon(board, x)
  if (poly.length < 4) return 0
  // In our loop construction, the first half represents the bottom profile
  // from bottom-center to right rail, mirrored to left rail.
  // The bottom points span from left rail apex to right rail apex.
  // Let's identify the points with the lower y values or simply segment indices.
  // Since the loop is bottom-center -> right rail apex -> deck-center -> left rail apex -> bottom-center
  // The bottom profile is from left rail apex (around index 3*n/4) to bottom-center to right rail apex (index n/4).
  const n = poly.length
  const q = Math.floor(n / 4)
  
  // Collect bottom segments
  let len = 0
  // Bottom-center is index 0. Right rail apex is index q. Left rail apex is index 3*q.
  // We sum segment lengths from index 3*q to n-1, n-1 to 0, 0 to q.
  const indices: number[] = []
  for (let i = 3 * q; i < n; i++) indices.push(i)
  indices.push(0)
  for (let i = 1; i <= q; i++) indices.push(i)

  for (let i = 0; i < indices.length - 1; i++) {
    const p1 = poly[indices[i]]
    const p2 = poly[indices[i + 1]]
    len += Math.hypot(p2.x - p1.x, p2.y - p1.y)
  }
  return len
}

export interface HydrodynamicResults {
  planformAreaSqCm: number
  wettedSurfaceAreaSqCm: number
  volumeLiters: number
  lcbFromTailCm: number
  lcbPercent: number
  distributionCurve: { x: number; area: number }[]
}

/** Calculates wetted surface area, total volume, LCB, and area distribution along length. */
export function computeHydrodynamics(board: BoardState, steps = 40): HydrodynamicResults {
  const length = board.length
  if (length <= 0) {
    return {
      planformAreaSqCm: 0,
      wettedSurfaceAreaSqCm: 0,
      volumeLiters: 0,
      lcbFromTailCm: 0,
      lcbPercent: 0,
      distributionCurve: []
    }
  }

  const planformAreaSqCm = computePlanformArea(board)
  const distributionCurve: { x: number; area: number }[] = []
  
  let totalVolume = 0
  let momentOfVolume = 0 // for center of buoyancy
  let wettedSurfaceAreaSqCm = 0

  const dx = length / steps

  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * length
    const area = computeCrossSectionalArea(board, x)
    distributionCurve.push({ x, area })

    const perimeter = computeBottomPerimeter(board, x)

    if (i > 0) {
      const prevX = ((i - 1) / steps) * length
      const prevArea = distributionCurve[i - 1].area
      const prevPerimeter = computeBottomPerimeter(board, prevX)

      // Trapezoidal integration for volume
      const stepVolume = ((prevArea + area) / 2) * dx
      totalVolume += stepVolume
      // Centroid moment (x-axis)
      momentOfVolume += stepVolume * (x - dx / 2)

      // Trapezoidal integration for wetted surface
      wettedSurfaceAreaSqCm += ((prevPerimeter + perimeter) / 2) * dx
    }
  }

  const volumeLiters = totalVolume / 1000 // cm^3 to Liters

  // LCB relative to nose (x = 0)
  const lcbFromNose = totalVolume > 0 ? momentOfVolume / totalVolume : length / 2
  // LCB relative to tail (x = length)
  const lcbFromTailCm = length - lcbFromNose
  const lcbPercent = length > 0 ? (lcbFromTailCm / length) * 100 : 50

  return {
    planformAreaSqCm,
    wettedSurfaceAreaSqCm,
    volumeLiters,
    lcbFromTailCm: Math.round(lcbFromTailCm * 10) / 10,
    lcbPercent: Math.round(lcbPercent * 10) / 10,
    distributionCurve
  }
}
