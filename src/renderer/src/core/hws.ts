// Hollow Wood Surfboard (HWS) construction: generates the internal skeleton for a
// strip-planked hollow build — transverse ribs sliced from the real hull shape at
// configurable stations, a full-length center spine plank, and a rail-frame band per
// rib — as flat 2D cut profiles ready for CNC/laser. Classic "rib and spine" hollow
// construction (cedar-strip or thin-ply skin glued over a rib/spine skeleton, spine
// threaded through a mortise hole in each rib before the rig is glued up). This is
// this app's own independently-designed take on the technique — not derived from any
// reference implementation.

import { evaluateCurve, evaluatePath, resampleOnX } from './bezier'
import { buildFullRailLoop, interpolateStationPoints } from './crossSection'
import { deckStepOffsetAt } from './deckStep'
import type { BoardState, CurveCP } from './types'
import type { Point } from './bezier'

export interface HwsConfig {
  /** Number of rib stations, evenly spaced strictly between nose and tail (both excluded — too thin/narrow to rib there). */
  ribCount: number
  /** Sheet stock thickness (plywood/MDF), cm — also the width of the spine mortise hole cut through each rib. */
  materialThicknessCm: number
  /** Strip-built (or thin-ply) skin thickness, cm — each rib sits this far inboard of the real hull surface so the skin has somewhere to land. */
  skinThicknessCm: number
  /** Height of the rectangular spine mortise/plank, cm. */
  spineSlotHeightCm: number
  /** Width of the rail-frame band (annular ring inboard of each rib's outer edge), cm. Set to 0 to skip rail-frame parts. */
  railFrameBandWidthCm: number
  /** Laser/CNC kerf compensation, cm — solid outlines grow outward and holes shrink inward by half this amount so cut parts measure true. */
  kerfCm: number
}

export function defaultHwsConfig(): HwsConfig {
  return {
    ribCount: 5,
    materialThicknessCm: 0.6,
    skinThicknessCm: 0.5,
    spineSlotHeightCm: 5,
    railFrameBandWidthCm: 3,
    kerfCm: 0.02
  }
}

export interface RibProfile {
  /** 0..1 position along board length. */
  station: number
  /** x position, cm from nose. */
  x: number
  /** Closed outer boundary, real cm coordinates (y = lateral, z = vertical). */
  outer: Point[]
  /** Closed spine-mortise hole boundary, same coordinate space as `outer`. */
  hole: Point[]
}

export interface RailFrameProfile {
  station: number
  x: number
  /** Outer boundary (same as the rib's outer edge). */
  outer: Point[]
  /** Inner boundary (outer inset inward by `railFrameBandWidthCm`) — the band is the annular region between the two. */
  inner: Point[]
}

export interface SpineProfile {
  /** Closed rectangular outline, real cm coordinates (x = length position, z = local plank-height axis, centered on 0). */
  outline: Point[]
  /** Length of the plank, cm — spans between the first and last rib station (not the full board, which tapers to zero at the true tips). */
  spanLength: number
}

function polygonCentroid(points: Point[]): Point {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

/**
 * Offsets a closed polygon by moving each vertex along the averaged normal of its
 * two adjacent edges. Positive `distance` moves inward (toward the centroid),
 * negative moves outward. Approximate (no self-intersection handling), but exact
 * enough for the smooth, roughly-convex rail-loop shapes this module offsets —
 * `distance` is always small relative to the loop's radius of curvature.
 */
export function offsetClosedLoop(points: Point[], distance: number): Point[] {
  if (distance === 0 || points.length < 3) return points.map((p) => ({ ...p }))
  const centroid = polygonCentroid(points)
  const n = points.length
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    const len1 = Math.hypot(p.x - prev.x, p.y - prev.y) || 1
    const len2 = Math.hypot(next.x - p.x, next.y - p.y) || 1
    const n1x = -(p.y - prev.y) / len1
    const n1y = (p.x - prev.x) / len1
    const n2x = -(next.y - p.y) / len2
    const n2y = (next.x - p.x) / len2
    let nx = n1x + n2x
    let ny = n1y + n2y
    const nlen = Math.hypot(nx, ny) || 1
    nx /= nlen
    ny /= nlen
    const toCentroidX = centroid.x - p.x
    const toCentroidY = centroid.y - p.y
    if (nx * toCentroidX + ny * toCentroidY < 0) {
      nx = -nx
      ny = -ny
    }
    return { x: p.x + nx * distance, y: p.y + ny * distance }
  })
}

/** Real (y, z) hull cross-section loop at longitudinal position `x` — same geometry as exportDXF's crossSectionPolylines, minus the x coordinate. */
function hullLoopAt(board: BoardState, x: number, samplesPerHalf = 24): Point[] {
  const { outline, outlineOpposite, outlineSymmetric, rocker, deck, deckStep, length, crossSections } = board
  const outlineCurve = evaluatePath(outline, 100)
  const rockerCurve = evaluateCurve(...(rocker as CurveCP), 100)
  const deckCurve = evaluateCurve(...(deck as CurveCP), 100)

  const wRight = Math.max(resampleOnX(outlineCurve, [x])[0], 0.1)
  const wLeft = outlineSymmetric ? wRight : Math.max(resampleOnX(evaluatePath(outlineOpposite ?? outline, 100), [x])[0], 0.1)
  const cz = resampleOnX(rockerCurve, [x])[0]
  const deckZ = resampleOnX(deckCurve, [x])[0] + deckStepOffsetAt(deckStep, x, length)
  const h = Math.max(deckZ - cz, 0.1)

  const t = length > 0 ? x / length : 0
  const halfPts = interpolateStationPoints(crossSections, t)
  const loop = buildFullRailLoop(halfPts, samplesPerHalf)
  return loop.map((p) => ({ x: p.x * (p.x >= 0 ? wRight : wLeft), y: cz + p.y * h }))
}

/** Rib stations, evenly spaced strictly between nose and tail (both excluded — the hull tapers to ~zero cross-section right at the tips). */
function ribStationPositions(ribCount: number): number[] {
  const n = Math.max(1, ribCount)
  return Array.from({ length: n }, (_, i) => (i + 1) / (n + 1))
}

export function generateRibProfiles(board: BoardState, config: HwsConfig): RibProfile[] {
  const stations = ribStationPositions(config.ribCount)
  return stations.map((t) => {
    const x = t * board.length
    const hullLoop = hullLoopAt(board, x)
    const insetLoop = offsetClosedLoop(hullLoop, config.skinThicknessCm)
    const outer = offsetClosedLoop(insetLoop, -config.kerfCm / 2)

    const zs = insetLoop.map((p) => p.y)
    const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2
    const holeHalfW = Math.max(config.materialThicknessCm / 2 - config.kerfCm / 2, 0.05)
    const holeHalfH = Math.max(config.spineSlotHeightCm / 2 - config.kerfCm / 2, 0.05)
    const hole: Point[] = [
      { x: -holeHalfW, y: centerZ - holeHalfH },
      { x: holeHalfW, y: centerZ - holeHalfH },
      { x: holeHalfW, y: centerZ + holeHalfH },
      { x: -holeHalfW, y: centerZ + holeHalfH }
    ]

    return { station: t, x, outer, hole }
  })
}

export function generateRailFrameProfiles(board: BoardState, config: HwsConfig): RailFrameProfile[] {
  if (config.railFrameBandWidthCm <= 0) return []
  const stations = ribStationPositions(config.ribCount)
  return stations.map((t) => {
    const x = t * board.length
    const hullLoop = hullLoopAt(board, x)
    const insetLoop = offsetClosedLoop(hullLoop, config.skinThicknessCm)
    const outer = offsetClosedLoop(insetLoop, -config.kerfCm / 2)
    const inner = offsetClosedLoop(insetLoop, config.railFrameBandWidthCm + config.kerfCm / 2)
    return { station: t, x, outer, inner }
  })
}

export function generateSpineProfile(board: BoardState, config: HwsConfig): SpineProfile {
  const stations = ribStationPositions(config.ribCount)
  const xs = stations.map((t) => t * board.length)
  const spanLength = Math.max(...xs) - Math.min(...xs)
  const halfH = config.spineSlotHeightCm / 2 + config.kerfCm / 2
  const outline: Point[] = [
    { x: 0, y: -halfH },
    { x: spanLength, y: -halfH },
    { x: spanLength, y: halfH },
    { x: 0, y: halfH }
  ]
  return { outline, spanLength }
}
