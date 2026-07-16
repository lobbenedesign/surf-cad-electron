// Graphic design layers applied to the deck (top) and/or bottom of the board:
// rectangles, lines, and imported raster/vector images, positioned in the same
// board-plan cm coordinates as the outline (x = 0..length nose->tail, y =
// signed lateral offset from the stringer).

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
  /** image/pdf: data URL. For 'pdf' this is the raw file, previewed as a placeholder (page rendering isn't implemented yet). */
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

function svgTransform(layer: DesignLayer): string {
  return `translate(${layer.x} ${layer.y}) rotate(${layer.rotation})`
}

/** Builds a standalone SVG document (board-plan cm as user units) for one surface's layers. */
export function exportDesignSvg(layers: DesignLayer[], length: number, width: number): string {
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
    }
    // 'pdf' layers have no vector representation yet — omitted from SVG export.
  }
  parts.push('</svg>')
  return parts.join('')
}
