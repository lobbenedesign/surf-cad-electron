// Graphic design layers applied to the deck (top) and/or bottom of the board:
// rectangles, lines, and imported raster/vector images, positioned in the same
// board-plan cm coordinates as the outline (x = 0..length nose->tail, y =
// signed lateral offset from the stringer).

import { getOrRenderPdfCanvas } from './pdfRender'

export type DesignLayerType = 'rect' | 'line' | 'image' | 'pdf'

export interface DesignLayer {
  id: string
  type: DesignLayerType
  /** Center x, cm (board-plan, 0 = nose). */
  x: number
  /** Center y, cm (0 = stringer). */
  y: number
  width: number
  height: number
  /** Degrees, clockwise. */
  rotation: number
  /** Stroke/fill color for rect and line. */
  color: string
  strokeWidth: number
  /** rect only: filled vs outline. */
  filled: boolean
  /** image/pdf: data URL. For 'pdf' this is the raw file; its first page is rasterized on demand (see core/pdfRender.ts) and cached by the caller. */
  src?: string
  /** Original filename, shown in the layer list and the pdf placeholder. */
  name?: string
}

export type DesignSurface = 'deck' | 'bottom'

export interface BoardDesign {
  /** When true, the bottom uses the same layers as the deck (edits to one apply to both) instead of its own independent set. */
  linkSurfaces: boolean
  deck: DesignLayer[]
  bottom: DesignLayer[]
}

export function defaultBoardDesign(): BoardDesign {
  return { linkSurfaces: false, deck: [], bottom: [] }
}

let nextLayerId = 1
export function createLayer(type: DesignLayerType, partial: Partial<DesignLayer> = {}): DesignLayer {
  return {
    id: `layer-${nextLayerId++}`,
    type,
    x: 0,
    y: 0,
    width: type === 'line' ? 40 : 20,
    height: type === 'line' ? 0 : 20,
    rotation: 0,
    color: '#22d3ee',
    strokeWidth: 0.4,
    filled: type === 'rect',
    ...partial
  }
}

/** Returns the layer list for a surface, respecting linkSurfaces (bottom mirrors deck when linked). */
export function layersFor(design: BoardDesign, surface: DesignSurface): DesignLayer[] {
  if (design.linkSurfaces) return design.deck
  return design[surface]
}

/** Applies an edit to a surface's layers; when linked, always writes to `deck` (the shared source of truth). */
export function updateLayers(design: BoardDesign, surface: DesignSurface, layers: DesignLayer[]): BoardDesign {
  const target: DesignSurface = design.linkSurfaces ? 'deck' : surface
  return { ...design, [target]: layers }
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/**
 * Aligns the selected layers' axis-aligned bounding boxes (ignoring rotation
 * — a deliberate simplification, same as most 2D design tools' quick-align)
 * to the extreme/average edge of the selection itself. No-op below 2 selected.
 */
export function alignLayers(layers: DesignLayer[], ids: string[], mode: AlignMode): DesignLayer[] {
  const selected = layers.filter((l) => ids.includes(l.id))
  if (selected.length < 2) return layers
  const left = (l: DesignLayer): number => l.x - l.width / 2
  const right = (l: DesignLayer): number => l.x + l.width / 2
  const top = (l: DesignLayer): number => l.y - l.height / 2
  const bottom = (l: DesignLayer): number => l.y + l.height / 2
  const avg = (fn: (l: DesignLayer) => number): number => selected.reduce((s, l) => s + fn(l), 0) / selected.length

  const target =
    mode === 'left'
      ? Math.min(...selected.map(left))
      : mode === 'right'
        ? Math.max(...selected.map(right))
        : mode === 'top'
          ? Math.min(...selected.map(top))
          : mode === 'bottom'
            ? Math.max(...selected.map(bottom))
            : mode === 'hcenter'
              ? avg((l) => l.x)
              : avg((l) => l.y)

  return layers.map((l) => {
    if (!ids.includes(l.id)) return l
    switch (mode) {
      case 'left':
        return { ...l, x: target + l.width / 2 }
      case 'right':
        return { ...l, x: target - l.width / 2 }
      case 'hcenter':
        return { ...l, x: target }
      case 'top':
        return { ...l, y: target + l.height / 2 }
      case 'bottom':
        return { ...l, y: target - l.height / 2 }
      case 'vcenter':
        return { ...l, y: target }
    }
  })
}

/** Spaces the selected layers' centers evenly between the extremes of the selection along one axis. No-op below 3 selected. */
export function distributeLayers(layers: DesignLayer[], ids: string[], axis: 'x' | 'y'): DesignLayer[] {
  const selected = layers.filter((l) => ids.includes(l.id))
  if (selected.length < 3) return layers
  const sorted = [...selected].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y))
  const firstPos = axis === 'x' ? sorted[0].x : sorted[0].y
  const lastPos = axis === 'x' ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y
  const step = (lastPos - firstPos) / (sorted.length - 1)
  const targetById = new Map<string, number>(sorted.map((l, i) => [l.id, firstPos + step * i]))

  return layers.map((l) => {
    const pos = targetById.get(l.id)
    if (pos === undefined) return l
    return axis === 'x' ? { ...l, x: pos } : { ...l, y: pos }
  })
}

/**
 * Renders a surface's layers onto an off-screen canvas in board-plan cm coordinates
 * (x: 0=nose, y: 0=one rail edge .. width=other rail edge) at a fixed px/cm density.
 * Shared by the Design tab's PNG/PDF export (a clean render, no editor guides/selection)
 * and `ThreeDView`'s mesh texture (§6 "design as 3D texture" — same pixels, just mapped
 * onto the hull via UV instead of downloaded as a file). `imageCache` is caller-owned so
 * repeated calls (e.g. one per texture refresh) don't re-decode already-loaded images;
 * `onImageLoad` fires once per image the first time it finishes loading, so the caller
 * can re-render/re-apply a texture that was built before the image was ready.
 * `backgroundColor` defaults to the editor/export backdrop (near-black); `ThreeDView`
 * passes white instead, since its canvas is multiplied onto the hull material's base
 * color as a texture — white leaves unpainted area showing the plain hull color instead
 * of tinting it toward black.
 *
 * `pdfCache`/`pdfPending` are the same idea as `imageCache` but for 'pdf' layers,
 * whose first page is rasterized asynchronously via pdf.js (core/pdfRender.ts) —
 * callers must own and persist these across calls (e.g. a ref), same as
 * `imageCache`, or a render will never find its own cached result and will
 * re-request the page every call.
 */
export function renderDesignCanvas(
  layers: DesignLayer[],
  length: number,
  width: number,
  imageCache: Map<string, HTMLImageElement>,
  onImageLoad?: () => void,
  backgroundColor = '#0b0b0b',
  pdfCache?: Map<string, HTMLCanvasElement>,
  pdfPending?: Set<string>
): HTMLCanvasElement {
  const pxPerCm = 8
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(length * pxPerCm))
  c.height = Math.max(1, Math.round(width * pxPerCm))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, c.width, c.height)

  const getImage = (src: string): HTMLImageElement | null => {
    let img = imageCache.get(src)
    if (!img) {
      img = new Image()
      img.onload = () => onImageLoad?.()
      img.src = src
      imageCache.set(src, img)
    }
    return img.complete && img.naturalWidth > 0 ? img : null
  }

  layers.forEach((layer) => {
    const cx = layer.x * pxPerCm
    const cy = (layer.y + width / 2) * pxPerCm
    const w = layer.width * pxPerCm
    const h = layer.height * pxPerCm
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((layer.rotation * Math.PI) / 180)
    if (layer.type === 'rect') {
      if (layer.filled) {
        ctx.fillStyle = layer.color
        ctx.fillRect(-w / 2, -h / 2, w, h)
      } else {
        ctx.strokeStyle = layer.color
        ctx.lineWidth = layer.strokeWidth * pxPerCm
        ctx.strokeRect(-w / 2, -h / 2, w, h)
      }
    } else if (layer.type === 'line') {
      ctx.strokeStyle = layer.color
      ctx.lineWidth = layer.strokeWidth * pxPerCm
      ctx.beginPath()
      ctx.moveTo(-w / 2, -h / 2)
      ctx.lineTo(w / 2, h / 2)
      ctx.stroke()
    } else if (layer.type === 'image' && layer.src) {
      const img = getImage(layer.src)
      if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h)
    } else if (layer.type === 'pdf' && layer.src && pdfCache && pdfPending) {
      const pdfCanvas = getOrRenderPdfCanvas(layer.src, pdfCache, pdfPending, () => onImageLoad?.())
      if (pdfCanvas) ctx.drawImage(pdfCanvas, -w / 2, -h / 2, w, h)
    }
    ctx.restore()
  })
  return c
}

function svgTransform(layer: DesignLayer): string {
  return `translate(${layer.x} ${layer.y}) rotate(${layer.rotation})`
}

/** Builds a standalone SVG document (board-plan cm as user units) for one surface's layers. `pdfCache` (optional) embeds an already-rasterized PDF page as a raster `<image>`; a 'pdf' layer not yet rendered (or if the cache is omitted) is skipped, same as before this was supported. */
export function exportDesignSvg(
  layers: DesignLayer[],
  length: number,
  width: number,
  pdfCache?: Map<string, HTMLCanvasElement>
): string {
  const halfWidth = width / 2
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${length} ${width}" width="${length}cm" height="${width}cm">`,
    `<rect x="0" y="0" width="${length}" height="${width}" fill="#0b0b0b" />`
  ]
  for (const layer of layers) {
    const g = `<g transform="${svgTransform(layer)} translate(${halfWidth} 0)">`
    if (layer.type === 'rect') {
      parts.push(
        `${g}<rect x="${-layer.width / 2}" y="${-layer.height / 2}" width="${layer.width}" height="${layer.height}" ` +
          `${layer.filled ? `fill="${layer.color}"` : `fill="none" stroke="${layer.color}" stroke-width="${layer.strokeWidth}"`} /></g>`
      )
    } else if (layer.type === 'line') {
      parts.push(
        `${g}<line x1="${-layer.width / 2}" y1="${-layer.height / 2}" x2="${layer.width / 2}" y2="${layer.height / 2}" ` +
          `stroke="${layer.color}" stroke-width="${layer.strokeWidth}" /></g>`
      )
    } else if (layer.type === 'image' && layer.src) {
      parts.push(
        `${g}<image x="${-layer.width / 2}" y="${-layer.height / 2}" width="${layer.width}" height="${layer.height}" href="${layer.src}" /></g>`
      )
    } else if (layer.type === 'pdf' && layer.src) {
      // No vector representation of a PDF page — embed its already-rasterized
      // first page (if the caller has one cached) as a raster <image>.
      const pdfCanvas = pdfCache?.get(layer.src)
      if (pdfCanvas) {
        parts.push(
          `${g}<image x="${-layer.width / 2}" y="${-layer.height / 2}" width="${layer.width}" height="${layer.height}" href="${pdfCanvas.toDataURL('image/png')}" /></g>`
        )
      }
    }
  }
  parts.push('</svg>')
  return parts.join('')
}
