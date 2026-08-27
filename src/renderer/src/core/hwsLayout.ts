// Naive sequential (shelf) 2D packing of HWS cut parts onto one or more sheets of
// stock material — no true nesting/rotation optimization in v1, just left-to-right,
// top-to-bottom placement wrapping to a new row/sheet on overflow. Good enough to
// produce a cuttable, non-overlapping layout; a human can still hand-tweak spacing
// in the CAM/laser software afterward.

import type { Point } from './bezier'

export interface SheetLayoutOptions {
  sheetWidthCm: number
  sheetHeightCm: number
  marginCm: number
}

export const DEFAULT_SHEET_LAYOUT: SheetLayoutOptions = { sheetWidthCm: 120, sheetHeightCm: 60, marginCm: 1 }

export interface HwsPart {
  label: string
  outer: Point[]
  holes?: Point[][]
}

export interface PlacedPart {
  label: string
  sheetIndex: number
  outer: Point[]
  holes: Point[][]
}

function boundingBox(points: Point[]): { minX: number; minY: number; width: number; height: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

export function layoutPartsOnSheets(parts: HwsPart[], opts: SheetLayoutOptions = DEFAULT_SHEET_LAYOUT): PlacedPart[] {
  const placed: PlacedPart[] = []
  let sheetIndex = 0
  let cursorX = opts.marginCm
  let cursorY = opts.marginCm
  let rowHeight = 0

  for (const part of parts) {
    const bb = boundingBox(part.outer)

    if (cursorX + bb.width > opts.sheetWidthCm - opts.marginCm && cursorX > opts.marginCm) {
      cursorX = opts.marginCm
      cursorY += rowHeight + opts.marginCm
      rowHeight = 0
    }
    if (cursorY + bb.height > opts.sheetHeightCm - opts.marginCm && cursorY > opts.marginCm) {
      sheetIndex += 1
      cursorX = opts.marginCm
      cursorY = opts.marginCm
      rowHeight = 0
    }

    const offsetX = cursorX - bb.minX
    const offsetY = cursorY - bb.minY
    placed.push({
      label: part.label,
      sheetIndex,
      outer: part.outer.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
      holes: (part.holes ?? []).map((h) => h.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })))
    })

    cursorX += bb.width + opts.marginCm
    rowHeight = Math.max(rowHeight, bb.height)
  }

  return placed
}

export function countSheets(placed: PlacedPart[]): number {
  return placed.length === 0 ? 0 : Math.max(...placed.map((p) => p.sheetIndex)) + 1
}
