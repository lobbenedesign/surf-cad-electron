// Minimal ASCII DXF (R12 / AC1009) writer: POLYLINE + VERTEX + SEQEND entities,
// the most broadly compatible DXF entity type for 2D contours (LWPOLYLINE is a
// later DXF revision some CAM software still can't read). Coordinates in mm.

import { evaluateCurve } from './bezier'
import type { BoardState, CurveCP } from './types'
import type { Point } from './bezier'

function polyline(layer: string, points: Point[], closed: boolean): string {
  const lines: string[] = []
  lines.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0')
  for (const p of points) {
    lines.push('0', 'VERTEX', '8', layer, '10', p.x.toFixed(4), '20', p.y.toFixed(4), '30', '0.0')
  }
  lines.push('0', 'SEQEND')
  return lines.join('\n')
}

/** Full mirrored outline (both rails), in mm, x = 0..length. */
function outlinePolylinePoints(board: BoardState): Point[] {
  const half = evaluateCurve(...(board.outline as CurveCP), 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const mirrored = [...half].reverse().map((p) => ({ x: p.x, y: -p.y }))
  return [...half, ...mirrored]
}

/** Rocker (bottom) + deck (top) profile curves, in mm, offset vertically apart for clarity. */
function profilePolylines(board: BoardState): { rocker: Point[]; deck: Point[] } {
  const rocker = evaluateCurve(...(board.rocker as CurveCP), 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const deck = evaluateCurve(...(board.deck as CurveCP), 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  return { rocker, deck }
}

/** Returns ASCII DXF (R12) text with the outline on layer OUTLINE and rocker/deck on PROFILE. */
export function exportBoardToDxf(board: BoardState): string {
  const { rocker, deck } = profilePolylines(board)
  const entities = [
    polyline('OUTLINE', outlinePolylinePoints(board), true),
    polyline('PROFILE_ROCKER', rocker, false),
    polyline('PROFILE_DECK', deck, false)
  ].join('\n')

  return [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    entities,
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n')
}
