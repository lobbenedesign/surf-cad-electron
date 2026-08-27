// G-code export. Mirrors BoardCAD's g-code menu split (GCODEOUTLINE/GCODEPROFILE/
// GCODEDECK/GCODEBOTTOM — see roadmap.md §5): a single-pass 2D outline contour,
// a single-pass 2D profile-template contour (for cutting a stringer/profile
// blank), and real multi-pass 3-axis surface rasters for deck/bottom (Z follows
// the actual rail cross-section height across the width, not a flat plane).
// Coordinates in mm, feed in mm/min.

import { evaluateCurve, evaluatePath, resampleOnX } from './bezier'
import { buildFullRailLoop, interpolateStationPoints } from './crossSection'
import { deckStepOffsetAt } from './deckStep'
import type { BoardState, CurveCP } from './types'
import type { Point } from './bezier'

interface Point3 {
  x: number
  y: number
  z: number
}

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
  const right = evaluatePath(board.outline, 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const leftSource = board.outlineSymmetric ? board.outline : (board.outlineOpposite ?? board.outline)
  const leftForward = evaluatePath(leftSource, 150).map((p) => ({ x: p.x * 10, y: -p.y * 10 }))
  const left = [...leftForward].reverse()
  return [...right, ...left, right[0]]
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

/** Cuts the rocker or deck centerline curve as a single-pass 2D contour — for cutting a stringer/profile template blank on a 2-axis machine, BoardCAD's "Profile" g-code menu item. */
export function exportProfileGcode(
  board: BoardState,
  which: 'rocker' | 'deck',
  opts: GcodeOptions = DEFAULT_GCODE_OPTIONS
): string {
  const curve = evaluateCurve(...(board[which] as CurveCP), 150).map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const lines: string[] = [
    `; SURF-CAD Electron - ${which} profile template`,
    `; board: ${board.name} — length ${board.length}cm`,
    'G21 ; units = mm',
    'G90 ; absolute positioning',
    `G0 Z${opts.safeHeightMm}`,
    `G0 X${curve[0].x.toFixed(3)} Y${curve[0].y.toFixed(3)}`,
    `G1 Z${opts.cutDepthMm} F${opts.plungeRateMmMin}`
  ]
  for (const p of curve.slice(1)) {
    lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F${opts.feedRateMmMin}`)
  }
  lines.push(`G0 Z${opts.safeHeightMm}`, 'M30 ; end program')
  return lines.join('\n')
}

export interface SurfaceGcodeOptions extends GcodeOptions {
  stations: number
  pointsPerPass: number
}

export const DEFAULT_SURFACE_GCODE_OPTIONS: SurfaceGcodeOptions = {
  ...DEFAULT_GCODE_OPTIONS,
  stations: 40,
  pointsPerPass: 24
}

/**
 * One raster pass per X station across the real deck or bottom surface (Z follows
 * the actual rail cross-section height as Y sweeps across the width, not a flat
 * plane) — BoardCAD's "Deck"/"Bottom" g-code menu items. Direction alternates
 * left<->right between stations (boustrophedon) so the tool doesn't need a full
 * retract between every pass, only a Z lift.
 */
export function exportSurfaceGcode(
  board: BoardState,
  side: 'deck' | 'bottom',
  opts: SurfaceGcodeOptions = DEFAULT_SURFACE_GCODE_OPTIONS
): string {
  const { outline, outlineOpposite, outlineSymmetric, rocker, deck, deckStep, length, crossSections } = board
  const outlineCurve = evaluatePath(outline, 100)
  const rockerCurve = evaluateCurve(...(rocker as CurveCP), 100)
  const deckCurve = evaluateCurve(...(deck as CurveCP), 100)
  const stationXs = Array.from({ length: opts.stations }, (_, i) => (i / (opts.stations - 1)) * length)
  const outlineYRight = resampleOnX(outlineCurve, stationXs)
  const outlineYLeft = outlineSymmetric ? outlineYRight : resampleOnX(evaluatePath(outlineOpposite ?? outline, 100), stationXs)
  const rockerZ = resampleOnX(rockerCurve, stationXs)
  const deckZ = resampleOnX(deckCurve, stationXs).map((z, i) => z + deckStepOffsetAt(deckStep, stationXs[i], length))

  const passes: Point3[][] = stationXs.map((cx, i) => {
    const wRight = Math.max(outlineYRight[i], 0.1)
    const wLeft = Math.max(outlineYLeft[i], 0.1)
    const h = Math.max(deckZ[i] - rockerZ[i], 0.1)
    const cz = rockerZ[i]
    const t = length > 0 ? cx / length : 0
    const halfPts = interpolateStationPoints(crossSections, t)
    const loop = buildFullRailLoop(halfPts, opts.pointsPerPass)
    const filtered = loop.filter((p) => (side === 'deck' ? p.y >= 0.5 : p.y <= 0.5))
    filtered.sort((a, b) => a.x - b.x)
    return filtered.map((p) => ({ x: cx * 10, y: p.x * (p.x >= 0 ? wRight : wLeft) * 10, z: (cz + p.y * h) * 10 }))
  })

  const lines: string[] = [
    `; SURF-CAD Electron - ${side} surface raster (${opts.stations} passes)`,
    `; board: ${board.name} — length ${board.length}cm, width ${board.width}cm`,
    'G21 ; units = mm',
    'G90 ; absolute positioning'
  ]
  passes.forEach((pass, i) => {
    if (pass.length === 0) return
    const ordered = i % 2 === 0 ? pass : [...pass].reverse()
    lines.push(`; pass ${i + 1}/${passes.length} — X=${(pass[0].x / 10).toFixed(1)}cm`)
    lines.push(`G0 Z${opts.safeHeightMm}`)
    lines.push(`G0 X${ordered[0].x.toFixed(3)} Y${ordered[0].y.toFixed(3)}`)
    lines.push(`G1 Z${ordered[0].z.toFixed(3)} F${opts.plungeRateMmMin}`)
    for (const p of ordered.slice(1)) {
      lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F${opts.feedRateMmMin}`)
    }
  })
  lines.push(`G0 Z${opts.safeHeightMm}`, 'M30 ; end program')
  return lines.join('\n')
}
