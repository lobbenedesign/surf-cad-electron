// Renders an imported PDF's first page to an offscreen canvas via pdf.js, so
// a 'pdf' design layer can be drawn like any other raster source instead of
// showing a placeholder icon. Rendering is async (pdf.js parses/rasterizes
// off the main render path), so callers get a cache + a "loaded" callback —
// same pattern as the existing image cache in design.ts/DesignEditor.tsx,
// just adapted for a Promise instead of an <img onload>.

import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Decodes a `data:...;base64,...` URL into raw bytes — pdf.js's `url` loader tries to `fetch()` its input, which rejects `data:` URLs, so the data must be handed over as bytes instead. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Rasterizes a PDF data URL's first page onto a new canvas at `scale` (pdf.js's CSS-px-per-PDF-unit factor — higher = sharper when the layer is displayed large). */
async function renderPdfFirstPageToCanvas(dataUrl: string, scale = 3): Promise<HTMLCanvasElement> {
  const loadingTask = pdfjsLib.getDocument({ data: dataUrlToBytes(dataUrl) })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  await loadingTask.destroy()
  return canvas
}

/**
 * Cache-through lookup: returns the already-rendered page canvas for `src`,
 * or kicks off rendering (once — `pending` prevents duplicate concurrent
 * requests for the same src) and returns null until `onLoad` fires and the
 * caller re-reads the cache.
 */
export function getOrRenderPdfCanvas(
  src: string,
  cache: Map<string, HTMLCanvasElement>,
  pending: Set<string>,
  onLoad: () => void
): HTMLCanvasElement | null {
  const cached = cache.get(src)
  if (cached) return cached
  if (!pending.has(src)) {
    pending.add(src)
    renderPdfFirstPageToCanvas(src)
      .then((canvas) => {
        cache.set(src, canvas)
        onLoad()
      })
      .catch(() => {
        // Malformed/unsupported PDF — leave uncached, caller's placeholder-less
        // branch just draws nothing rather than crash the editor.
      })
      .finally(() => pending.delete(src))
  }
  return null
}
