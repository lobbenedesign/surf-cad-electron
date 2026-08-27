// 1:1 multi-page tiled print sheet for tracing the outline directly onto a
// foam blank ("ricalco"). Distinct from specSheetPdf.ts (a not-to-scale A4
// summary) and design.ts (deck/bottom artwork at true scale) — this exports
// only the half-outline profile (the app's native representation: one rail
// edge from nose to tail, centerline at y=0) tiled across as many A4 landscape
// pages as needed at exact 1cm-board = 10mm-paper scale, standard practice
// for printable surfboard/ski/snowboard templates (half-template, flip to cut
// the other rail). See roadmap.md §5.

import jsPDF from 'jspdf'
import { evaluatePath } from './bezier'
import { applyTailToOutline } from './tailShape'
import type { BoardState } from './types'
import type { Point } from './bezier'

const PAGE_W = 297
const PAGE_H = 210
const MARGIN = 10
const OVERLAP = 12
const USABLE_W = PAGE_W - 2 * MARGIN
const USABLE_H = PAGE_H - 2 * MARGIN
const STEP_X = USABLE_W - OVERLAP
const STEP_Y = USABLE_H - OVERLAP
const MM_PER_CM = 10

function drawCalibrationSquare(doc: jsPDF, x: number, y: number): void {
  doc.setDrawColor(0)
  doc.setLineWidth(0.25)
  doc.rect(x, y, MM_PER_CM, MM_PER_CM)
  doc.setFontSize(6)
  doc.setTextColor(0)
  doc.text('Verifica: questo quadrato deve misurare esattamente 10.00 x 10.00 cm', x, y + MM_PER_CM + 3)
  doc.text('(disattiva "adatta alla pagina" nella stampa — usa scala 100%)', x, y + MM_PER_CM + 6)
}

function drawRegistrationCross(doc: jsPDF, x: number, y: number): void {
  const s = 3
  doc.setDrawColor(200, 0, 0)
  doc.setLineWidth(0.2)
  doc.line(x - s, y, x + s, y)
  doc.line(x, y - s, x, y + s)
}

/**
 * Exports the board's half-outline (nose->tail rail edge) tiled across A4
 * landscape pages at true 1:1 scale. Pages overlap by `OVERLAP` mm so the
 * printed sheets can be taped together and trimmed to a continuous line.
 */
export function exportPrintSheetPdf(board: BoardState): void {
  const half: Point[] = board.outlineSymmetric
    ? applyTailToOutline(evaluatePath(board.outline, 400), board.length, board.tailShape)
    : evaluatePath(board.outline, 400)

  const totalWMM = board.length * MM_PER_CM
  const maxY = Math.max(...half.map((p) => p.y), 1)
  const totalHMM = maxY * MM_PER_CM

  const cols = Math.max(1, Math.ceil(totalWMM / STEP_X))
  const rows = Math.max(1, Math.ceil(totalHMM / STEP_Y))

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })

  // 10cm grid lines in world space, and the half-outline polyline, both
  // clipped naturally by the PDF page boundary (content outside the media
  // box just doesn't render — the standard technique for poster tiling).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r > 0 || c > 0) doc.addPage('a4', 'landscape')
      const originX = c * STEP_X
      const originY = r * STEP_Y
      const toPage = (p: Point): [number, number] => [MARGIN - originX + p.x * MM_PER_CM, MARGIN - originY + p.y * MM_PER_CM]

      // Reference grid every 10cm (world space) for alignment.
      doc.setDrawColor(220)
      doc.setLineWidth(0.15)
      for (let gx = 0; gx <= board.length; gx += 10) {
        const [sx0, sy0] = toPage({ x: gx, y: 0 })
        const [sx1, sy1] = toPage({ x: gx, y: maxY })
        doc.line(sx0, sy0, sx1, sy1)
      }
      for (let gy = 0; gy <= maxY; gy += 10) {
        const [sx0, sy0] = toPage({ x: 0, y: gy })
        const [sx1, sy1] = toPage({ x: board.length, y: gy })
        doc.line(sx0, sy0, sx1, sy1)
      }

      // Centerline (y=0, the fold/mirror line).
      doc.setDrawColor(200, 0, 0)
      doc.setLineWidth(0.3)
      const [cx0, cy0] = toPage({ x: 0, y: 0 })
      const [cx1, cy1] = toPage({ x: board.length, y: 0 })
      doc.line(cx0, cy0, cx1, cy1)

      // Half-outline (rail edge).
      doc.setDrawColor(20, 90, 200)
      doc.setLineWidth(0.5)
      const [sx0, sy0] = toPage(half[0])
      const deltas: [number, number][] = []
      let prev: [number, number] = [sx0, sy0]
      for (let i = 1; i < half.length; i++) {
        const [sx, sy] = toPage(half[i])
        deltas.push([sx - prev[0], sy - prev[1]])
        prev = [sx, sy]
      }
      doc.lines(deltas, sx0, sy0)

      // Overlap registration crosses at the printable-area corners.
      drawRegistrationCross(doc, MARGIN, MARGIN)
      drawRegistrationCross(doc, MARGIN + USABLE_W, MARGIN)
      drawRegistrationCross(doc, MARGIN, MARGIN + USABLE_H)
      drawRegistrationCross(doc, MARGIN + USABLE_W, MARGIN + USABLE_H)

      drawCalibrationSquare(doc, MARGIN, PAGE_H - MARGIN - MM_PER_CM - 8)

      doc.setFontSize(9)
      doc.setTextColor(0)
      doc.text(`${board.name} — pagina C${c + 1}R${r + 1} di ${cols}x${rows} — scala 1:1`, MARGIN, 6)
      const arrows: string[] = []
      if (c < cols - 1) arrows.push('→ continua a destra')
      if (r < rows - 1) arrows.push('↓ continua sotto')
      if (arrows.length) {
        doc.setFontSize(7)
        doc.setTextColor(120)
        doc.text(arrows.join('   '), PAGE_W - MARGIN - 60, 6)
      }
    }
  }

  const safeName = board.name.trim().replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'board'
  doc.save(`${safeName}_template-1-1.pdf`)
}
