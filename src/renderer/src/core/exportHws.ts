// DXF (R12) / SVG export for HWS cut sheets. One file per sheet; each sheet holds
// one closed polyline/path per part outer boundary plus one per hole (mortise,
// rail-frame inner ring) — a standard way to describe cut-with-holes shapes for
// laser/CNC software, no boolean geometry needed. Coordinates in mm.

import type { Point } from './bezier'
import type { PlacedPart } from './hwsLayout'

function dxfPolyline(pointsCm: Point[]): string {
  const lines = ['0', 'POLYLINE', '8', 'CUT', '66', '1', '70', '1']
  for (const p of pointsCm) {
    lines.push('0', 'VERTEX', '8', 'CUT', '10', (p.x * 10).toFixed(4), '20', (p.y * 10).toFixed(4), '30', '0.0')
  }
  lines.push('0', 'SEQEND')
  return lines.join('\n')
}

/** One ASCII DXF (R12) file per sheet. */
export function exportHwsSheetsToDxf(placed: PlacedPart[], sheetCount: number): string[] {
  const files: string[] = []
  for (let s = 0; s < sheetCount; s++) {
    const onSheet = placed.filter((p) => p.sheetIndex === s)
    const entities = onSheet.flatMap((p) => [dxfPolyline(p.outer), ...p.holes.map(dxfPolyline)])
    files.push(['0', 'SECTION', '2', 'ENTITIES', entities.join('\n'), '0', 'ENDSEC', '0', 'EOF'].join('\n'))
  }
  return files
}

function svgPathD(pointsCm: Point[]): string {
  const mm = pointsCm.map((p) => ({ x: p.x * 10, y: p.y * 10 }))
  const [first, ...rest] = mm
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')} Z`
}

/** One SVG file per sheet, viewBox in mm, for laser software that prefers SVG over DXF. */
export function exportHwsSheetsToSvg(
  placed: PlacedPart[],
  sheetCount: number,
  opts: { sheetWidthCm: number; sheetHeightCm: number }
): string[] {
  const wMm = opts.sheetWidthCm * 10
  const hMm = opts.sheetHeightCm * 10
  const files: string[] = []
  for (let s = 0; s < sheetCount; s++) {
    const onSheet = placed.filter((p) => p.sheetIndex === s)
    const paths = onSheet.flatMap((p) => [svgPathD(p.outer), ...p.holes.map(svgPathD)])
    const body = paths.map((d) => `  <path d="${d}" fill="none" stroke="black" stroke-width="0.2" />`).join('\n')
    files.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${wMm} ${hMm}">\n${body}\n</svg>`
    )
  }
  return files
}
