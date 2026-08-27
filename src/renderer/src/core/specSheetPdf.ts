// Spec sheet PDF: a not-to-scale A4 summary (name, dimensions, tail/fin setup,
// outline + rocker diagrams, station table, volume/area) — distinct from the
// graphic-design export in design.ts (which prints deck/bottom artwork at
// true board scale for template/ricalco use). See roadmap.md §5.

import jsPDF from 'jspdf'
import { evaluateCurve, evaluatePath } from './bezier'
import { computeStationMeasurements, estimateVolumeLiters, estimatePlanAreaM2 } from './measurements'
import { applyTailToOutline } from './tailShape'
import type { BoardState, CurveCP } from './types'
import type { Point } from './bezier'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15

function drawDiagram(doc: jsPDF, points: Point[], boxX: number, boxY: number, boxW: number, boxH: number): void {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 0.01)
  const spanY = Math.max(maxY - minY, 0.01)
  const scale = Math.min(boxW / spanX, boxH / spanY) * 0.9

  const toPage = (p: Point): [number, number] => [
    boxX + boxW / 2 + (p.x - (minX + maxX) / 2) * scale,
    boxY + boxH / 2 - (p.y - (minY + maxY) / 2) * scale
  ]

  const deltas: [number, number][] = []
  const [sx0, sy0] = toPage(points[0])
  let prev: [number, number] = [sx0, sy0]
  for (let i = 1; i < points.length; i++) {
    const [sx, sy] = toPage(points[i])
    deltas.push([sx - prev[0], sy - prev[1]])
    prev = [sx, sy]
  }
  doc.setDrawColor(20, 90, 200)
  doc.setLineWidth(0.3)
  doc.lines(deltas, sx0, sy0)
}

export function exportSpecSheetPdf(board: BoardState): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  doc.setFontSize(20)
  doc.text(board.name, MARGIN, 20)
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(
    `Lunghezza ${board.length.toFixed(1)}cm  ·  Larghezza ${board.width.toFixed(1)}cm  ·  Spessore ${board.thickness.toFixed(1)}cm  ·  Coda ${board.tailShape.type}`,
    MARGIN,
    27
  )
  doc.text(`Setup pinne: ${board.finSetup.type} (${board.finSetup.slots.length} pinne)`, MARGIN, 32)

  // Outline diagram (mirrored, tail-shape aware)
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text('OUTLINE (top view)', MARGIN, 42)
  const half = board.outlineSymmetric
    ? applyTailToOutline(evaluatePath(board.outline, 150), board.length, board.tailShape)
    : evaluatePath(board.outline, 150)
  const mirrored = [...half].reverse().map((p) => ({ x: p.x, y: -p.y }))
  drawDiagram(doc, [...half, ...mirrored], MARGIN, 45, PAGE_W - 2 * MARGIN, 55)

  // Rocker + deck profile diagram
  doc.text('PROFILO (rocker / deck)', MARGIN, 108)
  const rockerPts = evaluateCurve(...(board.rocker as CurveCP), 150)
  const deckPts = evaluateCurve(...(board.deck as CurveCP), 150)
  doc.setDrawColor(220, 60, 40)
  drawDiagram(doc, rockerPts, MARGIN, 111, PAGE_W - 2 * MARGIN, 40)
  doc.setDrawColor(40, 180, 70)
  drawDiagram(doc, deckPts, MARGIN, 111, PAGE_W - 2 * MARGIN, 40)

  // Station table
  let y = 165
  doc.setFontSize(11)
  doc.setTextColor(0)
  doc.text('Misure per stazione', MARGIN, y)
  y += 6
  doc.setFontSize(9)
  const rows = computeStationMeasurements(board, 'straight')
  const cols = [MARGIN, MARGIN + 45, MARGIN + 90, MARGIN + 135]
  doc.setTextColor(120)
  ;['Stazione', 'Larghezza', 'Spessore', 'Rocker'].forEach((h, i) => doc.text(h, cols[i], y))
  y += 5
  doc.setDrawColor(200)
  doc.line(MARGIN, y - 3, PAGE_W - MARGIN, y - 3)
  doc.setTextColor(0)
  rows.forEach((r) => {
    doc.text(r.label, cols[0], y)
    doc.text(`${r.width.toFixed(1)} cm`, cols[1], y)
    doc.text(`${r.thickness.toFixed(1)} cm`, cols[2], y)
    doc.text(`${r.rocker.toFixed(1)} cm`, cols[3], y)
    y += 6
  })

  y += 4
  doc.setFontSize(11)
  doc.text(
    `Volume stimato: ${estimateVolumeLiters(board).toFixed(2)} L    ·    Area piano: ${estimatePlanAreaM2(board).toFixed(2)} m²`,
    MARGIN,
    y
  )

  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text('Diagrammi non in scala — generato da SURF-CAD Electron', MARGIN, PAGE_H - 10)

  const safeName = board.name.trim().replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'board'
  doc.save(`${safeName}_spec-sheet.pdf`)
}
