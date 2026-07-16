// Basic 2.5D outline-contour G-code (mirrors BoardCAD's "Outline" g-code export,
// GCODEOUTLINE_STR — a single-pass perimeter cut, not full 3-axis surface machining).
// Coordinates in mm, feed in mm/min.

import { evaluateCurve } from './bezier'
import type { BoardState, CurveCP } from './types'
import type { Point } from './bezier'

export interface GcodeOptions {
  safeHeightMm: number
  cutDepthMm: number
  feedRateMmMin: number
  plungeRateMmMin: number
}

export const DEFAULT_GCODE_OPTIONS: GcodeOptions = {
  safeHeightMm: 10,
  cutDepthMm: -5,
  feedRateMmMin: 1500,
  plungeRateMmMin: 300
}

function outlineLoopMm(board: BoardState): Point[] {
  const half = evaluateCurve(...(board.outline as CurveCP), 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const mirrored = [...half].reverse().map((p) => ({ x: p.x, y: -p.y }))
  return [...half, ...mirrored, half[0]]
}

/** Returns G-code text cutting the board's outline perimeter in a single pass. */
export function exportOutlineGcode(board: BoardState, opts: GcodeOptions = DEFAULT_GCODE_OPTIONS): string {
  const loop = outlineLoopMm(board)
  const lines: string[] = [
    '; SURF-CAD Electron - outline contour',
    `; board: ${board.name} — length ${board.length}cm, width ${board.width}cm`,
    'G21 ; units = mm',
    'G90 ; absolute positioning',
    `G0 Z${opts.safeHeightMm}`,
    `G0 X${loop[0].x.toFixed(3)} Y${loop[0].y.toFixed(3)}`,
    `G1 Z${opts.cutDepthMm} F${opts.plungeRateMmMin}`
  ]
  for (const p of loop.slice(1)) {
    lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F${opts.feedRateMmMin}`)
  }
  lines.push(`G0 Z${opts.safeHeightMm}`, 'M30 ; end program')
  return lines.join('\n')
}
