// Fin mounting sheets: the measurements a shaper needs to route the fin boxes
// into the foam at the right spot once the board shape is final — distance
// from the tail tip, from the nearest rail edge, and from the centerline/
// stringer (rail + center distances always sum to the real half-width at that
// station), plus the box footprint (from FIN_BOX_SPECS) for each fin.
// Two export shapes: a not-to-scale A4/A3 summary (diagram + data table) and a
// 1:1 tiled template (same tiling technique as printSheetPdf.ts) for tracing
// the box positions directly onto the board.

import jsPDF from 'jspdf'
import { evaluatePath } from './bezier'
import { railHalfWidthAt } from './outlinePath'
import { FIN_BOX_SPECS } from './finGeometry'
import type { BoardState } from './types'
import type { FinSlot } from './finTypes'
import type { Point } from './bezier'

interface FinMountData {
  slot: FinSlot
  mountX: number
  mountY: number
  side: 'destra' | 'sinistra' | 'centro'
  distFromTail: number
  distFromRail: number
  distFromCenter: number
  box: { tabWidth: number; tabDepth: number; tabLength: number; label: string }
}

function computeFinMountData(board: BoardState): FinMountData[] {
  return board.finSetup.slots.map((slot) => {
    const mountX = board.length - slot.distFromTail
    const sideSign = Math.sign(slot.railInset)
    const halfWidth = railHalfWidthAt(board, mountX, sideSign || 1)
    const distFromRail = Math.abs(slot.railInset)
    const distFromCenter = Math.max(halfWidth - distFromRail, 0)
    return {
      slot,
      mountX,
      mountY: sideSign * distFromCenter,
      side: sideSign === 0 ? 'centro' : sideSign > 0 ? 'destra' : 'sinistra',
      distFromTail: slot.distFromTail,
      distFromRail,
      distFromCenter,
      box: FIN_BOX_SPECS[slot.fin.box]
    }
  })
}

/** Full closed outline (both rails), in board-plan cm, x = 0..length. */
function fullOutlinePoints(board: BoardState): Point[] {
  const right = evaluatePath(board.outline, 200)
  const leftSource = board.outlineSymmetric ? board.outline : (board.outlineOpposite ?? board.outline)
  const leftForward = evaluatePath(leftSource, 200).map((p) => ({ x: p.x, y: -p.y }))
  return [...right, ...[...leftForward].reverse()]
}

/** CAD-style dimension line for jsPDF: a thin line with small perpendicular end-ticks and a centered text label. */
function drawPdfDimLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, label: string): void {
  doc.setDrawColor(90)
  doc.setLineWidth(0.15)
  doc.line(x1, y1, x2, y2)
  const tick = 1
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * tick
  const ny = (dx / len) * tick
  doc.line(x1 - nx, y1 - ny, x1 + nx, y1 + ny)
  doc.line(x2 - nx, y2 - ny, x2 + nx, y2 + ny)
  doc.setFontSize(6)
  doc.setTextColor(40)
  doc.text(label, (x1 + x2) / 2, (y1 + y2) / 2 - 1, { align: 'center' })
}

export interface FinMountingSummaryOptions {
  pageSize?: 'a4' | 'a3'
  showDimensions?: boolean
}

/**
 * Not-to-scale A4/A3 summary: outline diagram with fin positions (+ dimension
 * lines when `showDimensions`), and a data table with every measurement + box
 * spec needed to cut the fin boxes.
 */
export function exportFinMountingSummaryPdf(board: BoardState, opts: FinMountingSummaryOptions = {}): void {
  const pageSize = opts.pageSize ?? 'a4'
  const showDimensions = opts.showDimensions ?? true
  const PAGE_W = pageSize === 'a3' ? 297 : 210
  const PAGE_H = pageSize === 'a3' ? 420 : 297
  const MARGIN = 15
  const doc = new jsPDF({ unit: 'mm', format: pageSize })

  doc.setFontSize(18)
  doc.text(`${board.name} — Scheda montaggio pinne`, MARGIN, 18)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(
    `Setup: ${board.finSetup.type} (${board.finSetup.slots.length} pinne)  ·  Lunghezza ${board.length.toFixed(1)}cm  ·  Larghezza ${board.width.toFixed(1)}cm`,
    MARGIN,
    24
  )

  // Outline + fin diagram, one shared scale/offset for outline, fin markers and dimension lines alike.
  const diagY = 32
  const diagH = pageSize === 'a3' ? 150 : 95
  const diagW = PAGE_W - 2 * MARGIN
  const outline = fullOutlinePoints(board)
  const fins = computeFinMountData(board)
  const xs = outline.map((p) => p.x)
  const ys = outline.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = Math.min(diagW / Math.max(maxX - minX, 0.01), diagH / Math.max(maxY - minY, 0.01)) * 0.88
  const toPage = (p: Point): [number, number] => [
    MARGIN + diagW / 2 + (p.x - (minX + maxX) / 2) * scale,
    diagY + diagH / 2 - (p.y - (minY + maxY) / 2) * scale
  ]

  doc.setDrawColor(20, 90, 200)
  doc.setLineWidth(0.3)
  const deltas: [number, number][] = []
  const [ox0, oy0] = toPage(outline[0])
  let prevO: [number, number] = [ox0, oy0]
  for (let i = 1; i < outline.length; i++) {
    const [ox, oy] = toPage(outline[i])
    deltas.push([ox - prevO[0], oy - prevO[1]])
    prevO = [ox, oy]
  }
  doc.lines(deltas, ox0, oy0, [1, 1], 's', true)

  fins.forEach((f) => {
    const [fx, fy] = toPage({ x: f.mountX, y: f.mountY })
    doc.setFillColor(255, 149, 0)
    doc.circle(fx, fy, 1.3, 'F')
    doc.setFontSize(7)
    doc.setTextColor(0)
    doc.text(f.slot.label, fx + 2.2, fy + 1)

    if (showDimensions) {
      const [tailX, tailY] = toPage({ x: board.length, y: f.mountY })
      drawPdfDimLine(doc, fx, fy, tailX, tailY, `${f.distFromTail.toFixed(1)}cm`)
      const [centerX, centerY] = toPage({ x: f.mountX, y: 0 })
      drawPdfDimLine(doc, fx, fy, centerX, centerY, `${f.distFromCenter.toFixed(1)}cm`)
      const sideSign = Math.sign(f.slot.railInset) || 1
      const halfWidth = f.distFromRail + f.distFromCenter
      const [railX, railY] = toPage({ x: f.mountX, y: sideSign * halfWidth })
      drawPdfDimLine(doc, fx, fy, railX, railY, `${f.distFromRail.toFixed(1)}cm`)
    }
  })

  // Data table.
  let y = diagY + diagH + 12
  doc.setFontSize(11)
  doc.setTextColor(0)
  doc.text('Dati di montaggio', MARGIN, y)
  y += 7
  doc.setFontSize(8)
  const cols = [MARGIN, MARGIN + 26, MARGIN + 44, MARGIN + 78, MARGIN + 108, MARGIN + 138, MARGIN + 165]
  doc.setTextColor(120)
  ;['Pinna', 'Lato', 'Box', 'Dist. coda', 'Dist. bordo', 'Dist. centro', 'Tab W×D×L (cm)'].forEach((h, i) => doc.text(h, cols[i], y))
  y += 2
  doc.setDrawColor(200)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 5
  doc.setTextColor(0)
  fins.forEach((f) => {
    doc.text(f.slot.label, cols[0], y)
    doc.text(f.side, cols[1], y)
    doc.text(f.box.label, cols[2], y, { maxWidth: cols[3] - cols[2] - 2 })
    doc.text(`${f.distFromTail.toFixed(1)} cm`, cols[3], y)
    doc.text(`${f.distFromRail.toFixed(1)} cm`, cols[4], y)
    doc.text(`${f.distFromCenter.toFixed(1)} cm`, cols[5], y)
    doc.text(`${f.box.tabWidth}×${f.box.tabDepth}×${f.box.tabLength}`, cols[6], y)
    y += 10
  })

  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text('Diagramma non in scala — generato da SURF-CAD Electron', MARGIN, PAGE_H - 8)

  const safeName = board.name.trim().replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'board'
  const suffix = showDimensions ? '' : '_pulita'
  doc.save(`${safeName}_scheda-pinne-${pageSize}${suffix}.pdf`)
}

const TEMPLATE_PAGE_W = 297
const TEMPLATE_PAGE_H = 210
const TEMPLATE_MARGIN = 10
const TEMPLATE_OVERLAP = 12
const TEMPLATE_USABLE_W = TEMPLATE_PAGE_W - 2 * TEMPLATE_MARGIN
const TEMPLATE_USABLE_H = TEMPLATE_PAGE_H - 2 * TEMPLATE_MARGIN
const TEMPLATE_STEP_X = TEMPLATE_USABLE_W - TEMPLATE_OVERLAP
const TEMPLATE_STEP_Y = TEMPLATE_USABLE_H - TEMPLATE_OVERLAP
const MM_PER_CM = 10

/** Rectangle corners for a fin's box footprint (tabLength along the fin's chord, tabWidth across it), rotated by `toe` degrees around the mount point — a simplification of the real 3D box placement (which is also anchored to the fin's leading-base point and offset by cant) good enough for marking cut lines on a 2D template. */
function boxFootprintCorners(mountX: number, mountY: number, toeDeg: number, tabLength: number, tabWidth: number): Point[] {
  const rad = (toeDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hl = tabLength / 2
  const hw = tabWidth / 2
  const local: Point[] = [
    { x: -hl, y: -hw },
    { x: hl, y: -hw },
    { x: hl, y: hw },
    { x: -hl, y: hw }
  ]
  return local.map((p) => ({
    x: mountX + p.x * cos - p.y * sin,
    y: mountY + p.x * sin + p.y * cos
  }))
}

/**
 * 1:1 multi-page tiled template (A4 landscape, same tiling technique as
 * printSheetPdf.ts): full board outline + each fin's box footprint at its
 * exact real position/orientation, for tracing the cuts directly onto the
 * foam. `showDimensions` toggles the distance callouts (tail/rail/center) —
 * off for a clean template with just outline + box outlines.
 */
export function exportFinMountingTemplatePdf(board: BoardState, opts: { showDimensions?: boolean } = {}): void {
  const showDimensions = opts.showDimensions ?? true
  const outline = fullOutlinePoints(board).map((p) => ({ x: p.x * MM_PER_CM, y: p.y * MM_PER_CM }))
  const fins = computeFinMountData(board)

  const totalWMM = board.length * MM_PER_CM
  const maxAbsY = Math.max(...outline.map((p) => Math.abs(p.y)), 1)
  const totalHMM = maxAbsY * 2

  const cols = Math.max(1, Math.ceil(totalWMM / TEMPLATE_STEP_X))
  const rows = Math.max(1, Math.ceil(totalHMM / TEMPLATE_STEP_Y))

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r > 0 || c > 0) doc.addPage('a4', 'landscape')
      const originX = c * TEMPLATE_STEP_X
      const originY = r * TEMPLATE_STEP_Y - maxAbsY
      const toPage = (p: Point): [number, number] => [TEMPLATE_MARGIN - originX + p.x, TEMPLATE_MARGIN - originY + p.y]

      doc.setDrawColor(220)
      doc.setLineWidth(0.15)
      for (let gx = 0; gx <= board.length; gx += 10) {
        const [sx0, sy0] = toPage({ x: gx * MM_PER_CM, y: -maxAbsY })
        const [sx1, sy1] = toPage({ x: gx * MM_PER_CM, y: maxAbsY })
        doc.line(sx0, sy0, sx1, sy1)
      }

      doc.setDrawColor(200, 0, 0)
      doc.setLineWidth(0.25)
      const [cx0, cy0] = toPage({ x: 0, y: 0 })
      const [cx1, cy1] = toPage({ x: totalWMM, y: 0 })
      doc.line(cx0, cy0, cx1, cy1)

      doc.setDrawColor(20, 90, 200)
      doc.setLineWidth(0.4)
      const deltas: [number, number][] = []
      const [sx0, sy0] = toPage(outline[0])
      let prev: [number, number] = [sx0, sy0]
      for (let i = 1; i < outline.length; i++) {
        const [sx, sy] = toPage(outline[i])
        deltas.push([sx - prev[0], sy - prev[1]])
        prev = [sx, sy]
      }
      doc.lines(deltas, sx0, sy0)

      fins.forEach((f) => {
        const corners = boxFootprintCorners(
          f.mountX * MM_PER_CM,
          f.mountY * MM_PER_CM,
          f.slot.fin.toe,
          f.box.tabLength * MM_PER_CM,
          f.box.tabWidth * MM_PER_CM
        )
        doc.setDrawColor(255, 149, 0)
        doc.setLineWidth(0.35)
        const boxDeltas: [number, number][] = []
        const [bx0, by0] = toPage(corners[0])
        let bprev: [number, number] = [bx0, by0]
        for (let i = 1; i <= corners.length; i++) {
          const [bx, by] = toPage(corners[i % corners.length])
          boxDeltas.push([bx - bprev[0], by - bprev[1]])
          bprev = [bx, by]
        }
        doc.lines(boxDeltas, bx0, by0, [1, 1], 's', true)

        const [labelX, labelY] = toPage({ x: f.mountX * MM_PER_CM, y: f.mountY * MM_PER_CM })
        doc.setFontSize(6.5)
        doc.setTextColor(0)
        doc.text(f.slot.label, labelX + 2, labelY - 2)

        if (showDimensions) {
          const [tailX, tailY] = toPage({ x: totalWMM, y: f.mountY * MM_PER_CM })
          drawPdfDimLine(doc, labelX, labelY, tailX, tailY, `${f.distFromTail.toFixed(1)}cm`)
          const [centerX, centerY] = toPage({ x: f.mountX * MM_PER_CM, y: 0 })
          drawPdfDimLine(doc, labelX, labelY, centerX, centerY, `${f.distFromCenter.toFixed(1)}cm`)
        }
      })

      doc.setFontSize(8)
      doc.setTextColor(0)
      doc.text(`${board.name} — pinne — pagina C${c + 1}R${r + 1} di ${cols}x${rows} — scala 1:1`, TEMPLATE_MARGIN, 6)
    }
  }

  const safeName = board.name.trim().replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'board'
  const suffix = showDimensions ? '' : '_pulito'
  doc.save(`${safeName}_pinne-template-1-1${suffix}.pdf`)
}
