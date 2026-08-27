// Minimal ASCII DXF (R12 / AC1009) writer: POLYLINE + VERTEX + SEQEND entities,
// the most broadly compatible DXF entity type for 2D contours (LWPOLYLINE is a
// later DXF revision some CAM software still can't read). Coordinates in mm.

import { evaluateCurve, evaluatePath, resampleOnX } from './bezier'
import { buildFullRailLoop } from './crossSection'
import { deckStepOffsetAt } from './deckStep'
import type { BoardState, CurveCP } from './types'
import type { Point } from './bezier'

interface Point3 {
  x: number
  y: number
  z: number
}

function polyline(layer: string, points: Point[], closed: boolean, linetype?: string): string {
  return polyline3(
    layer,
    points.map((p) => ({ x: p.x, y: p.y, z: 0 })),
    closed,
    linetype,
    false
  )
}

/** `is3d` sets the 3D-polyline flag (group 70 bit 3) so CAD software treats vertices as a spatial (non-planar) path instead of assuming a flat XY polyline. */
function polyline3(layer: string, points: Point3[], closed: boolean, linetype?: string, is3d = false): string {
  const lines: string[] = []
  lines.push('0', 'POLYLINE', '8', layer)
  if (linetype) lines.push('6', linetype)
  const flag = (closed ? 1 : 0) | (is3d ? 8 : 0)
  lines.push('66', '1', '70', String(flag))
  for (const p of points) {
    lines.push('0', 'VERTEX', '8', layer, '10', p.x.toFixed(4), '20', p.y.toFixed(4), '30', p.z.toFixed(4))
  }
  lines.push('0', 'SEQEND')
  return lines.join('\n')
}

/** Full outline (both rails), in mm, x = 0..length. Mirrors the right rail unless the board is asymmetric, in which case the left rail is its own independently-shaped curve. */
function outlinePolylinePoints(board: BoardState): Point[] {
  const right = evaluatePath(board.outline, 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const leftSource = board.outlineSymmetric ? board.outline : (board.outlineOpposite ?? board.outline)
  const leftForward = evaluatePath(leftSource, 150).map((p) => ({ x: p.x * 10, y: -p.y * 10 }))
  return [...right, ...[...leftForward].reverse()]
}

/** Rocker (bottom) + deck (top) profile curves, in mm, offset vertically apart for clarity. */
function profilePolylines(board: BoardState): { rocker: Point[]; deck: Point[] } {
  const rocker = evaluateCurve(...(board.rocker as CurveCP), 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const deck = evaluateCurve(...(board.deck as CurveCP), 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  return { rocker, deck }
}

/** One closed 3D rail-loop polyline per defined cross-section station, positioned at its real X/width/thickness — same geometry math as `meshGenerator.ts`'s loft, so the DXF cross-sections match the 3D view exactly. */
function crossSectionPolylines(board: BoardState): Point3[][] {
  const { outline, outlineOpposite, outlineSymmetric, rocker, deck, deckStep, length, crossSections } = board
  const outlineCurve = evaluatePath(outline, 100)
  const rockerCurve = evaluateCurve(...(rocker as CurveCP), 100)
  const deckCurve = evaluateCurve(...(deck as CurveCP), 100)
  const stationXs = crossSections.map((s) => s.position * length)
  const outlineYRight = resampleOnX(outlineCurve, stationXs)
  const outlineYLeft = outlineSymmetric ? outlineYRight : resampleOnX(evaluatePath(outlineOpposite ?? outline, 100), stationXs)
  const rockerZ = resampleOnX(rockerCurve, stationXs)
  const deckZ = resampleOnX(deckCurve, stationXs).map((z, i) => z + deckStepOffsetAt(deckStep, stationXs[i], length))

  return crossSections.map((station, i) => {
    const cx = stationXs[i]
    const wRight = Math.max(outlineYRight[i], 0.1)
    const wLeft = Math.max(outlineYLeft[i], 0.1)
    const h = Math.max(deckZ[i] - rockerZ[i], 0.1)
    const cz = rockerZ[i]
    const loop = buildFullRailLoop(station.points, 16)
    return loop.map((p) => ({ x: cx * 10, y: p.x * (p.x >= 0 ? wRight : wLeft) * 10, z: (cz + p.y * h) * 10 }))
  })
}

/**
 * DXF SPLINE entity (AC1014/R14+ — not readable by strict R12-only software,
 * hence a separate opt-in export variant rather than the default) carrying
 * the *exact* analytic curve instead of a polyline approximation. `points` is
 * a chained multi-segment cubic-bezier path (length 3k+1, see OutlinePath in
 * types.ts — a plain 4-point CurveCP is just the k=1 case) and doubles
 * directly as the spline's control points: a clamped cubic B-spline with
 * knot multiplicity 4 at both ends and multiplicity 3 (=degree, so only
 * position/C0 continuity, matching our segments' independently-draggable
 * handles) at each internal join is mathematically identical to that exact
 * chain of bezier segments — no fitting/approximation needed.
 */
function splineEntity(layer: string, points: Point[], linetype?: string): string {
  const segCount = Math.max(1, Math.round((points.length - 1) / 3))
  const knots: number[] = [0, 0, 0, 0]
  for (let i = 1; i < segCount; i++) knots.push(i, i, i)
  knots.push(segCount, segCount, segCount, segCount)

  const lines: string[] = ['0', 'SPLINE', '8', layer]
  if (linetype) lines.push('6', linetype)
  lines.push('100', 'AcDbEntity', '100', 'AcDbSpline')
  lines.push('210', '0', '220', '0', '230', '1')
  lines.push('70', '8', '71', '3', '72', String(knots.length), '73', String(points.length), '74', '0')
  for (const k of knots) lines.push('40', k.toFixed(6))
  for (const p of points) lines.push('10', p.x.toFixed(4), '20', p.y.toFixed(4), '30', '0.0')
  return lines.join('\n')
}

function toMm(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x * 10, y: p.y * 10 }))
}

function toMmNegated(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x * 10, y: -p.y * 10 }))
}

/** R12 LTYPE table (CONTINUOUS + a DASHED entry so GHOST-layer entities render dashed in CAD software that respects per-entity/per-layer linetype). */
function ltypeTable(): string {
  return [
    '0', 'TABLE', '2', 'LTYPE', '70', '2',
    '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0',
    '0', 'LTYPE', '2', 'DASHED', '70', '0', '3', 'Dashed line', '72', '65', '73', '2', '40', '0.5', '49', '0.25', '49', '-0.25',
    '0', 'ENDTAB'
  ].join('\n')
}

/** Standard AutoCAD Color Index (ACI) per layer, matching the convention referenced in roadmap.md §1.6 (OUTLINE white, ROCKER blue, CROSSSECTION green, GHOST grey/dashed) plus a distinct color for DECK. */
const LAYER_COLORS: { name: string; color: number; linetype: string }[] = [
  { name: 'OUTLINE', color: 7, linetype: 'CONTINUOUS' },
  { name: 'PROFILE_ROCKER', color: 5, linetype: 'CONTINUOUS' },
  { name: 'PROFILE_DECK', color: 2, linetype: 'CONTINUOUS' },
  { name: 'CROSSSECTION', color: 3, linetype: 'CONTINUOUS' },
  { name: 'GHOST_OUTLINE', color: 8, linetype: 'DASHED' },
  { name: 'GHOST_PROFILE_ROCKER', color: 8, linetype: 'DASHED' },
  { name: 'GHOST_PROFILE_DECK', color: 8, linetype: 'DASHED' }
]

function layerTable(): string {
  const lines = ['0', 'TABLE', '2', 'LAYER', '70', String(LAYER_COLORS.length)]
  for (const l of LAYER_COLORS) {
    lines.push('0', 'LAYER', '2', l.name, '70', '0', '62', String(l.color), '6', l.linetype)
  }
  lines.push('0', 'ENDTAB')
  return lines.join('\n')
}

/** Returns ASCII DXF (R12) text: OUTLINE + PROFILE_ROCKER/PROFILE_DECK + CROSSSECTION layers (colored per `LAYER_COLORS`), plus a dashed GHOST_* set if `ghostBoard` is given. */
export function exportBoardToDxf(board: BoardState, ghostBoard?: BoardState | null): string {
  const { rocker, deck } = profilePolylines(board)
  const entities = [
    polyline('OUTLINE', outlinePolylinePoints(board), true),
    polyline('PROFILE_ROCKER', rocker, false),
    polyline('PROFILE_DECK', deck, false),
    ...crossSectionPolylines(board).map((pts) => polyline3('CROSSSECTION', pts, true, undefined, true))
  ]

  if (ghostBoard) {
    const g = profilePolylines(ghostBoard)
    entities.push(
      polyline('GHOST_OUTLINE', outlinePolylinePoints(ghostBoard), true, 'DASHED'),
      polyline('GHOST_PROFILE_ROCKER', g.rocker, false, 'DASHED'),
      polyline('GHOST_PROFILE_DECK', g.deck, false, 'DASHED')
    )
  }

  return [
    '0', 'SECTION', '2', 'TABLES',
    ltypeTable(),
    layerTable(),
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    entities.join('\n'),
    '0', 'ENDSEC',
    '0', 'EOF'
  ].join('\n')
}

/**
 * Same layers/layout as `exportBoardToDxf`, but the outline/rocker/deck
 * curves are real DXF SPLINE entities (exact bezier control points) instead
 * of polyline approximations — for CAD software that can re-edit the curve
 * natively. Cross-sections stay polylines (they're Catmull-Rom, not bezier,
 * so there's no exact spline conversion for them). Requires a DXF reader
 * that supports R14+ SPLINE entities.
 */
export function exportBoardToDxfSpline(board: BoardState, ghostBoard?: BoardState | null): string {
  const leftSource = board.outlineSymmetric ? board.outline : (board.outlineOpposite ?? board.outline)
  const entities = [
    splineEntity('OUTLINE', toMm(board.outline)),
    splineEntity('OUTLINE', toMmNegated(leftSource)),
    splineEntity('PROFILE_ROCKER', toMm(board.rocker as CurveCP)),
    splineEntity('PROFILE_DECK', toMm(board.deck as CurveCP)),
    ...crossSectionPolylines(board).map((pts) => polyline3('CROSSSECTION', pts, true, undefined, true))
  ]

  if (ghostBoard) {
    const ghostLeftSource = ghostBoard.outlineSymmetric ? ghostBoard.outline : (ghostBoard.outlineOpposite ?? ghostBoard.outline)
    entities.push(
      splineEntity('GHOST_OUTLINE', toMm(ghostBoard.outline), 'DASHED'),
      splineEntity('GHOST_OUTLINE', toMmNegated(ghostLeftSource), 'DASHED'),
      splineEntity('GHOST_PROFILE_ROCKER', toMm(ghostBoard.rocker as CurveCP), 'DASHED'),
      splineEntity('GHOST_PROFILE_DECK', toMm(ghostBoard.deck as CurveCP), 'DASHED')
    )
  }

  return [
    '0', 'SECTION', '2', 'TABLES',
    ltypeTable(),
    layerTable(),
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    entities.join('\n'),
    '0', 'ENDSEC',
    '0', 'EOF'
  ].join('\n')
}
