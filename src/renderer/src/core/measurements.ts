import { evaluateCurve, evaluatePath, resampleOnX } from './bezier'
import type { Point } from './bezier'
import { deckStepOffsetAt } from './deckStep'
import type { BoardState, CurveCP } from './types'

export interface StationMeasurement {
  label: string
  x: number
  width: number
  thickness: number
  rocker: number
}

export type MeasureMode = 'straight' | 'stringer'

/** Cumulative arc length of a curve's samples, same length as `samples`, s[0] = 0. */
function arcLengthTable(samples: Point[]): number[] {
  const s = [0]
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x
    const dy = samples[i].y - samples[i - 1].y
    s.push(s[i - 1] + Math.hypot(dx, dy))
  }
  return s
}

/**
 * Resolves the board-x position for a station defined as "distance from an end,
 * measured along the stringer (bottom curve) rather than in a straight line".
 * A given arc-length distance covers less x-span than the same straight-line
 * distance whenever the stringer is curved (rocker), so stringer-mode stations
 * sit closer to the end than their straight-line counterpart.
 */
function stationXAlongStringer(rockerCurve: Point[], length: number, distanceFromEnd: number, fromTail: boolean): number {
  const s = arcLengthTable(rockerCurve)
  const total = s[s.length - 1]
  const target = fromTail ? total - distanceFromEnd : distanceFromEnd
  // s is monotonically increasing with sample index (arc length), samples[i].x is monotonic with index too.
  for (let i = 1; i < s.length; i++) {
    if (s[i] >= target) {
      const f = (target - s[i - 1]) / Math.max(s[i] - s[i - 1], 1e-9)
      return rockerCurve[i - 1].x + (rockerCurve[i].x - rockerCurve[i - 1].x) * f
    }
  }
  return length
}

/** Samples width/thickness/rocker at Nose, Nose(30cm), Center, Tail(30cm) and Tail. */
export function computeStationMeasurements(board: BoardState, mode: MeasureMode = 'straight'): StationMeasurement[] {
  const { outline, outlineOpposite, outlineSymmetric, rocker, deck, length } = board
  const outlineCurve = evaluatePath(outline, 200)
  const outlineCurveLeft = outlineSymmetric ? outlineCurve : evaluatePath(outlineOpposite ?? outline, 200)
  const rockerCurve = evaluateCurve(...(rocker as CurveCP), 200)
  const deckCurve = evaluateCurve(...(deck as CurveCP), 200)

  const xForStraight = (distanceFromEnd: number, fromTail: boolean): number =>
    fromTail ? Math.max(length - distanceFromEnd, 0) : Math.min(distanceFromEnd, length)

  const stationX = (distanceFromEnd: number, fromTail: boolean): number =>
    mode === 'stringer'
      ? stationXAlongStringer(rockerCurve, length, Math.min(distanceFromEnd, length), fromTail)
      : xForStraight(distanceFromEnd, fromTail)

  const stations = [
    { label: 'Nose', x: 0 },
    { label: 'Nose (30cm)', x: stationX(30, false) },
    { label: 'Center', x: length / 2 },
    { label: 'Tail (30cm)', x: stationX(30, true) },
    { label: 'Tail', x: length }
  ]

  return stations.map((s) => {
    const wRight = resampleOnX(outlineCurve, [s.x])[0]
    const wLeft = resampleOnX(outlineCurveLeft, [s.x])[0]
    const rz = resampleOnX(rockerCurve, [s.x])[0]
    const dz = resampleOnX(deckCurve, [s.x])[0] + deckStepOffsetAt(board.deckStep, s.x, length)
    return { label: s.label, x: s.x, width: wRight + wLeft, thickness: Math.max(dz - rz, 0), rocker: rz }
  })
}

function interpAt(rows: StationMeasurement[], x: number): { width: number; thickness: number } {
  const sorted = [...rows].sort((a, b) => a.x - b.x)
  if (x <= sorted[0].x) return sorted[0]
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1]
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (x >= a.x && x <= b.x) {
      const f = (x - a.x) / (b.x - a.x || 1)
      return { width: a.width + (b.width - a.width) * f, thickness: a.thickness + (b.thickness - a.thickness) * f }
    }
  }
  return sorted[sorted.length - 1]
}

/** Rough volume estimate: integrates half-width x thickness x 0.68 (elliptical section factor) along length. */
export function estimateVolumeLiters(board: BoardState): number {
  const rows = computeStationMeasurements(board, 'straight')
  const n = 40
  const { length } = board
  let volumeCm3 = 0
  const step = length / n
  for (let i = 0; i < n; i++) {
    const x0 = i * step
    const x1 = x0 + step
    const w0 = interpAt(rows, x0)
    const w1 = interpAt(rows, x1)
    const areaAvg = ((w0.width * w0.thickness + w1.width * w1.thickness) / 2) * 0.68
    volumeCm3 += areaAvg * step
  }
  return volumeCm3 / 1000
}

/** Plan-view (outline) surface area, one side, in square meters — used for glass/weight estimates. */
export function estimatePlanAreaM2(board: BoardState): number {
  const outlineCurve = evaluatePath(board.outline, 200)
  const outlineCurveLeft = board.outlineSymmetric ? outlineCurve : evaluatePath(board.outlineOpposite ?? board.outline, 200)
  const commonX = Array.from({ length: 100 }, (_, i) => (i / 99) * board.length)
  const widthsRight = resampleOnX(outlineCurve, commonX)
  const widthsLeft = resampleOnX(outlineCurveLeft, commonX)
  let areaCm2 = 0
  const step = board.length / 99
  for (let i = 0; i < commonX.length - 1; i++) {
    const full0 = widthsRight[i] + widthsLeft[i]
    const full1 = widthsRight[i + 1] + widthsLeft[i + 1]
    areaCm2 += ((full0 + full1) / 2) * step
  }
  return areaCm2 / 10000
}
