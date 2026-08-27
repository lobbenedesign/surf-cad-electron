// Graphic design tab: draw rectangles/lines and import image/SVG/PDF files,
// positioned over a top-down guide of the board outline, separately for deck
// (top) and bottom or shared between the two. Exports to PNG, SVG, and PDF.
import { useCallback, useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import { evaluatePath, type Point } from '../core/bezier'
import {
  alignLayers,
  createLayer,
  distributeLayers,
  exportDesignSvg,
  layersFor,
  renderDesignCanvas,
  updateLayers,
  type AlignMode,
  type BoardDesign,
  type DesignLayer,
  type DesignSurface
} from '../core/design'
import { getOrRenderPdfCanvas } from '../core/pdfRender'

interface DesignEditorProps {
  design: BoardDesign
  onChange: (design: BoardDesign) => void
  outline: Point[]
  /** Independently-shaped left rail, only present when the board's outline is asymmetric. */
  outlineOpposite?: Point[]
  length: number
  width: number
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PADDING = 30
const HANDLE_SIZE = 8
const MIN_SIZE = 2
const ROTATE_HANDLE_OFFSET = 22

type DragMode =
  | { kind: 'move'; id: string; startPointer: Point; startLayers: Map<string, DesignLayer> }
  | { kind: 'resize'; id: string }
  | { kind: 'rotate'; id: string }

function toLocal(px: number, py: number, layer: DesignLayer): Point {
  const dx = px - layer.x
  const dy = py - layer.y
  const rad = (-layer.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
}

function toWorld(lx: number, ly: number, layer: DesignLayer): Point {
  const rad = (layer.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: layer.x + lx * cos - ly * sin, y: layer.y + lx * sin + ly * cos }
}

export function DesignEditor({
  design,
  onChange,
  outline,
  outlineOpposite,
  length,
  width,
  onDragStart,
  onDragEnd
}: DesignEditorProps): React.JSX.Element {
  const [surface, setSurface] = useState<DesignSurface>('deck')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 700, h: 320 })
  const dragRef = useRef<DragMode | null>(null)
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const pdfCache = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const pdfPending = useRef<Set<string>>(new Set())
  const [, bumpRender] = useState(0)

  const layers = layersFor(design, surface)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const selected = layers.find((l) => l.id === selectedId) ?? null
  const isSelected = (id: string): boolean => selectedIds.includes(id)
  const toggleSelection = (id: string, additive: boolean): void => {
    setSelectedIds((prev) => {
      if (!additive) return [id]
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    })
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect
      setSize({ w: Math.max(w, 100), h: Math.max(h, 100) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const halfExtent = width / 2 + 5
  const yRange = halfExtent * 2

  const toScreen = useCallback(
    (p: Point): [number, number] => {
      const sx = PADDING + (p.x / length) * (size.w - 2 * PADDING)
      const sy = PADDING + (1 - (p.y + halfExtent) / yRange) * (size.h - 2 * PADDING)
      return [sx, sy]
    },
    [length, size, halfExtent, yRange]
  )
  const scale = (size.w - 2 * PADDING) / length // px per cm (x and y share scale to avoid distortion)

  const toLogical = useCallback(
    (sx: number, sy: number): Point => {
      const x = ((sx - PADDING) / (size.w - 2 * PADDING)) * length
      const y = (1 - (sy - PADDING) / (size.h - 2 * PADDING)) * yRange - halfExtent
      return { x, y }
    },
    [length, size, halfExtent, yRange]
  )

  const getImage = (src: string): HTMLImageElement | null => {
    let img = imageCache.current.get(src)
    if (!img) {
      img = new Image()
      img.onload = () => bumpRender((n) => n + 1)
      img.src = src
      imageCache.current.set(src, img)
    }
    return img.complete && img.naturalWidth > 0 ? img : null
  }

  const outlineCurve = evaluatePath(outline, 150)
  const outlineCurveOpposite = evaluatePath(outlineOpposite ?? outline, 150)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = size.w
    canvas.height = size.h
    ctx.clearRect(0, 0, size.w, size.h)

    ctx.fillStyle = '#111'
    ctx.fillRect(PADDING, PADDING, size.w - 2 * PADDING, size.h - 2 * PADDING)

    const drawRail = (mirror: boolean): void => {
      const curve = mirror ? outlineCurveOpposite : outlineCurve
      ctx.beginPath()
      curve.forEach((p, i) => {
        const [sx, sy] = toScreen(mirror ? { x: p.x, y: -p.y } : p)
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    drawRail(false)
    drawRail(true)

    ctx.fillStyle = '#777'
    ctx.font = '11px sans-serif'
    ctx.fillText('NOSE', PADDING, size.h - 8)
    ctx.fillText('TAIL', size.w - PADDING - 24, size.h - 8)

    layers.forEach((layer) => {
      const [sx, sy] = toScreen({ x: layer.x, y: layer.y })
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      const w = layer.width * scale
      const h = layer.height * scale

      if (layer.type === 'rect') {
        if (layer.filled) {
          ctx.fillStyle = layer.color
          ctx.fillRect(-w / 2, -h / 2, w, h)
        } else {
          ctx.strokeStyle = layer.color
          ctx.lineWidth = layer.strokeWidth * scale
          ctx.strokeRect(-w / 2, -h / 2, w, h)
        }
      } else if (layer.type === 'line') {
        ctx.strokeStyle = layer.color
        ctx.lineWidth = layer.strokeWidth * scale
        ctx.beginPath()
        ctx.moveTo(-w / 2, -h / 2)
        ctx.lineTo(w / 2, h / 2)
        ctx.stroke()
      } else if (layer.type === 'image' && layer.src) {
        const img = getImage(layer.src)
        if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h)
      } else if (layer.type === 'pdf' && layer.src) {
        const pdfCanvas = getOrRenderPdfCanvas(layer.src, pdfCache.current, pdfPending.current, () => bumpRender((n) => n + 1))
        if (pdfCanvas) {
          ctx.drawImage(pdfCanvas, -w / 2, -h / 2, w, h)
        } else {
          // Still rasterizing (or failed) — a lightweight placeholder, not the final look.
          ctx.fillStyle = '#3c3c3c'
          ctx.fillRect(-w / 2, -h / 2, w, h)
          ctx.strokeStyle = '#888'
          ctx.strokeRect(-w / 2, -h / 2, w, h)
          ctx.fillStyle = '#ccc'
          ctx.font = '11px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('📄 …', 0, -4)
          ctx.font = '9px sans-serif'
          ctx.fillText(layer.name ?? '', 0, 10)
          ctx.textAlign = 'left'
        }
      }
      ctx.restore()

      if (isSelected(layer.id)) {
        const isPrimary = layer.id === selectedId && selectedIds.length === 1
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate((layer.rotation * Math.PI) / 180)
        ctx.strokeStyle = isPrimary ? '#ff9500' : '#5ac8fa'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.strokeRect(-w / 2, -h / 2, w, h)
        ctx.setLineDash([])
        if (isPrimary) {
          ctx.fillStyle = '#ff9500'
          ctx.fillRect(w / 2 - HANDLE_SIZE / 2, h / 2 - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
          // Rotate handle: a circle above the top edge, connected by a line — both drawn
          // in the same rotated+translated canvas space as the shape, so it stays
          // visually attached to the box through any rotation.
          const handleY = -h / 2 - ROTATE_HANDLE_OFFSET
          ctx.beginPath()
          ctx.moveTo(0, -h / 2)
          ctx.lineTo(0, handleY)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(0, handleY, HANDLE_SIZE / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
    })
  }, [layers, outlineCurve, outlineCurveOpposite, size, selectedIds, selectedId, toScreen, scale])

  const hitTestHandle = (mx: number, my: number): string | null => {
    if (!selected) return null
    const handleWorld = toWorld(selected.width / 2, selected.height / 2, selected)
    const [hx, hy] = toScreen(handleWorld)
    if (Math.hypot(hx - mx, hy - my) < 9) return selected.id
    return null
  }

  /** The rotate handle is drawn in raw screen-pixel space (see the draw effect above), so hit-testing and the drag math below both stay in screen space rather than going through the logical/cm `toWorld` transform. */
  const rotateHandleScreenPos = (layer: DesignLayer): [number, number] => {
    const [cx, cy] = toScreen({ x: layer.x, y: layer.y })
    const halfH = (layer.height * scale) / 2
    const rad = (layer.rotation * Math.PI) / 180
    const r = halfH + ROTATE_HANDLE_OFFSET
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)]
  }

  const hitTestRotateHandle = (mx: number, my: number): string | null => {
    if (!selected) return null
    const [hx, hy] = rotateHandleScreenPos(selected)
    if (Math.hypot(hx - mx, hy - my) < 9) return selected.id
    return null
  }

  const hitTestLayer = (mx: number, my: number): DesignLayer | null => {
    const logical = toLogical(mx, my)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      const local = toLocal(logical.x, logical.y, layer)
      if (Math.abs(local.x) <= layer.width / 2 + 1 && Math.abs(local.y) <= layer.height / 2 + 1) return layer
    }
    return null
  }

  const commit = (nextLayers: DesignLayer[]): void => onChange(updateLayers(design, surface, nextLayers))

  const applyAlign = (mode: AlignMode): void => {
    onDragStart?.()
    commit(alignLayers(layers, selectedIds, mode))
    onDragEnd?.()
  }
  const applyDistribute = (axis: 'x' | 'y'): void => {
    onDragStart?.()
    commit(distributeLayers(layers, selectedIds, axis))
    onDragEnd?.()
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const rotateId = hitTestRotateHandle(mx, my)
    if (rotateId) {
      dragRef.current = { kind: 'rotate', id: rotateId }
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
      return
    }
    const resizeId = hitTestHandle(mx, my)
    if (resizeId) {
      dragRef.current = { kind: 'resize', id: resizeId }
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
      return
    }
    const hit = hitTestLayer(mx, my)
    if (hit) {
      const movingIds = e.shiftKey ? (isSelected(hit.id) ? selectedIds : [...selectedIds, hit.id]) : isSelected(hit.id) && selectedIds.length > 1 ? selectedIds : [hit.id]
      setSelectedIds(movingIds)
      const startLayers = new Map(movingIds.map((id) => [id, { ...(layers.find((l) => l.id === id) as DesignLayer) }]))
      dragRef.current = { kind: 'move', id: hit.id, startPointer: toLogical(mx, my), startLayers }
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
    } else if (!e.shiftKey) {
      setSelectedIds([])
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const logical = toLogical(mx, my)

    if (drag.kind === 'move') {
      const dx = logical.x - drag.startPointer.x
      const dy = logical.y - drag.startPointer.y
      commit(
        layers.map((l) => {
          const start = drag.startLayers.get(l.id)
          return start ? { ...l, x: start.x + dx, y: start.y + dy } : l
        })
      )
    } else if (drag.kind === 'resize') {
      const layer = layers.find((l) => l.id === drag.id)
      if (!layer) return
      const local = toLocal(logical.x, logical.y, layer)
      const newWidth = Math.max(MIN_SIZE, Math.abs(local.x) * 2)
      const newHeight = Math.max(MIN_SIZE, Math.abs(local.y) * 2)
      commit(layers.map((l) => (l.id === drag.id ? { ...l, width: newWidth, height: newHeight } : l)))
    } else {
      const layer = layers.find((l) => l.id === drag.id)
      if (!layer) return
      const [cx, cy] = toScreen({ x: layer.x, y: layer.y })
      const rotation = (Math.atan2(mx - cx, -(my - cy)) * 180) / Math.PI
      commit(layers.map((l) => (l.id === drag.id ? { ...l, rotation } : l)))
    }
  }

  const handlePointerUp = (): void => {
    if (dragRef.current) onDragEnd?.()
    dragRef.current = null
  }

  const addShape = (type: 'rect' | 'line'): void => {
    const layer = createLayer(type, { x: length / 2, y: 0 })
    commit([...layers, layer])
    setSelectedIds([layer.id])
  }

  const moveLayerZOrder = (id: string, direction: 'up' | 'down'): void => {
    const i = layers.findIndex((l) => l.id === id)
    const j = direction === 'up' ? i + 1 : i - 1
    if (i < 0 || j < 0 || j >= layers.length) return
    const next = [...layers]
    ;[next[i], next[j]] = [next[j], next[i]]
    commit(next)
  }

  const importFile = (files: FileList | null, kind: 'image' | 'pdf'): void => {
    const file = files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      const src = reader.result as string
      const finish = (w: number, h: number): void => {
        const maxDim = Math.min(length, width) * 0.6
        const scaleDown = Math.max(w, h) > maxDim ? maxDim / Math.max(w, h) : 1
        const layer = createLayer(kind, {
          x: length / 2,
          y: 0,
          width: w * scaleDown,
          height: h * scaleDown,
          src,
          name: file.name
        })
        commit([...layers, layer])
        setSelectedIds([layer.id])
      }
      if (kind === 'image') {
        const img = new Image()
        img.onload = (): void => finish(img.naturalWidth / 8, img.naturalHeight / 8)
        img.src = src
      } else {
        finish(30, 40)
      }
    }
    reader.readAsDataURL(file)
  }

  const removeLayer = (id: string): void => {
    commit(layers.filter((l) => l.id !== id))
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  const updateSelected = (patch: Partial<DesignLayer>): void => {
    if (!selected) return
    commit(layers.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)))
  }

  const download = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderCleanCanvas = (): HTMLCanvasElement =>
    renderDesignCanvas(
      layers,
      length,
      width,
      imageCache.current,
      () => bumpRender((n) => n + 1),
      undefined,
      pdfCache.current,
      pdfPending.current
    )

  const exportPng = (): void => {
    renderCleanCanvas().toBlob((blob) => {
      if (blob) download(blob, `design-${surface}.png`)
    }, 'image/png')
  }

  const exportSvg = (): void => {
    const svg = exportDesignSvg(layers, length, width, pdfCache.current)
    download(new Blob([svg], { type: 'image/svg+xml' }), `design-${surface}.svg`)
  }

  const exportPdf = (): void => {
    const canvas = renderCleanCanvas()
    const doc = new jsPDF({ orientation: length >= width ? 'landscape' : 'portrait', unit: 'cm', format: [length, width] })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, length, width)
    doc.save(`design-${surface}.pdf`)
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr', gridTemplateColumns: '260px 1fr', height: '100%', minHeight: 0 }}>
      <div style={{ padding: 14, overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
        <h3 style={{ marginTop: 0 }}>Design grafico</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            className={surface === 'deck' ? 'active' : ''}
            style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}
            onClick={() => setSurface('deck')}
          >
            Top (Deck)
          </button>
          <button
            className={surface === 'bottom' ? 'active' : ''}
            style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}
            onClick={() => setSurface('bottom')}
          >
            Bottom
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={design.linkSurfaces}
            onChange={(e) => onChange({ ...design, linkSurfaces: e.target.checked })}
          />
          Stesso design su top e bottom
        </label>

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button style={{ flex: 1, fontSize: 12 }} onClick={() => addShape('rect')}>
            ▭ Rettangolo
          </button>
          <button style={{ flex: 1, fontSize: 12 }} onClick={() => addShape('line')}>
            ／ Linea
          </button>
        </div>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
          <span style={{ display: 'block', color: 'var(--text-dim)', marginBottom: 2 }}>Importa immagine / SVG</span>
          <input type="file" accept="image/*,.svg" onChange={(e) => importFile(e.target.files, 'image')} style={{ fontSize: 11, width: '100%' }} />
        </label>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 14 }}>
          <span style={{ display: 'block', color: 'var(--text-dim)', marginBottom: 2 }}>Importa PDF (prima pagina renderizzata)</span>
          <input type="file" accept=".pdf" onChange={(e) => importFile(e.target.files, 'pdf')} style={{ fontSize: 11, width: '100%' }} />
        </label>

        <h3>Livelli</h3>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: -8 }}>Shift+click per selezione multipla. ▲▼ cambiano l'ordine (z-order).</p>
        {selectedIds.length >= 2 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            <button title="Allinea a sinistra" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyAlign('left')}>
              ⇤ Sx
            </button>
            <button title="Centra orizzontalmente" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyAlign('hcenter')}>
              ↔ Centro
            </button>
            <button title="Allinea a destra" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyAlign('right')}>
              ⇥ Dx
            </button>
            <button title="Allinea in alto" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyAlign('top')}>
              ⇞ Alto
            </button>
            <button title="Centra verticalmente" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyAlign('vcenter')}>
              ↕ Centro
            </button>
            <button title="Allinea in basso" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyAlign('bottom')}>
              ⇟ Basso
            </button>
            {selectedIds.length >= 3 && (
              <>
                <button title="Distribuisci orizzontalmente" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyDistribute('x')}>
                  ⇹ Distrib. X
                </button>
                <button title="Distribuisci verticalmente" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => applyDistribute('y')}>
                  ⇳ Distrib. Y
                </button>
              </>
            )}
          </div>
        )}
        {layers.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nessun elemento. Aggiungine uno sopra.</p>}
        {layers.map((l, i) => (
          <div
            key={l.id}
            onClick={(e) => toggleSelection(l.id, e.shiftKey)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              marginBottom: 4,
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
              border: '1px solid ' + (isSelected(l.id) ? 'var(--accent)' : 'var(--border)')
            }}
          >
            <span>
              {l.type === 'rect' ? '▭' : l.type === 'line' ? '／' : l.type === 'image' ? '🖼' : '📄'} {l.name ?? l.type}
            </span>
            <span style={{ display: 'flex', gap: 2 }}>
              <button
                disabled={i === layers.length - 1}
                title="Porta avanti"
                onClick={(e) => {
                  e.stopPropagation()
                  moveLayerZOrder(l.id, 'up')
                }}
                style={{ fontSize: 11, padding: '2px 5px' }}
              >
                ▲
              </button>
              <button
                disabled={i === 0}
                title="Manda indietro"
                onClick={(e) => {
                  e.stopPropagation()
                  moveLayerZOrder(l.id, 'down')
                }}
                style={{ fontSize: 11, padding: '2px 5px' }}
              >
                ▼
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeLayer(l.id)
                }}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                ✕
              </button>
            </span>
          </div>
        ))}

        {selected && (
          <>
            <h3>Proprietà</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <NumField label="X (cm)" value={selected.x} onChange={(v) => updateSelected({ x: v })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              <NumField label="Y (cm)" value={selected.y} onChange={(v) => updateSelected({ y: v })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              <NumField label="Largh. (cm)" value={selected.width} onChange={(v) => updateSelected({ width: Math.max(MIN_SIZE, v) })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              <NumField label="Alt. (cm)" value={selected.height} onChange={(v) => updateSelected({ height: Math.max(MIN_SIZE, v) })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              <NumField label="Rotazione (°)" value={selected.rotation} onChange={(v) => updateSelected({ rotation: v })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              {(selected.type === 'rect' || selected.type === 'line') && (
                <NumField label="Spessore (cm)" value={selected.strokeWidth} onChange={(v) => updateSelected({ strokeWidth: Math.max(0.05, v) })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              )}
            </div>
            {(selected.type === 'rect' || selected.type === 'line') && (
              <div style={{ marginTop: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>Colore</label>
                <input type="color" value={selected.color} onChange={(e) => updateSelected({ color: e.target.value })} style={{ width: '100%' }} />
              </div>
            )}
            {selected.type === 'rect' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6 }}>
                <input type="checkbox" checked={selected.filled} onChange={(e) => updateSelected({ filled: e.target.checked })} />
                Riempito
              </label>
            )}
          </>
        )}

        <h3>Esporta ({surface})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={exportPng}>⬇️ PNG</button>
          <button onClick={exportSvg}>⬇️ SVG</button>
          <button onClick={exportPdf}>⬇️ PDF</button>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div className="quad-cell-label">
          {surface === 'deck' ? 'Design Top (Deck)' : 'Design Bottom'} — trascina per spostare, angolo per ridimensionare
        </div>
        <div ref={containerRef} style={{ height: 'calc(100% - 24px)' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{ cursor: dragRef.current ? 'grabbing' : 'default', display: 'block' }}
          />
        </div>
      </div>
    </div>
  )
}

interface NumFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

function NumField({ label, value, onChange, onDragStart, onDragEnd }: NumFieldProps): React.JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: 'var(--text-dim)' }}>
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onFocus={onDragStart}
        onBlur={onDragEnd}
        style={{ width: '100%', fontSize: 11, padding: '2px 4px' }}
      />
    </label>
  )
}
