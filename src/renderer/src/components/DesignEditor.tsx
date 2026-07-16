// Graphic design tab: draw rectangles/lines and import image/SVG/PDF files,
// positioned over a top-down guide of the board outline, separately for deck
// (top) and bottom or shared between the two. Exports to PNG, SVG, and PDF.
import { useCallback, useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import { evaluateCurve, type Point } from '../core/bezier'
import {
  createLayer,
  exportDesignSvg,
  layersFor,
  updateLayers,
  type BoardDesign,
  type DesignLayer,
  type DesignSurface
} from '../core/design'
import type { CurveCP } from '../core/types'

interface DesignEditorProps {
  design: BoardDesign
  onChange: (design: BoardDesign) => void
  outline: CurveCP
  length: number
  width: number
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PADDING = 30
const HANDLE_SIZE = 8
const MIN_SIZE = 2

type DragMode = { kind: 'move'; id: string; startPointer: Point; startLayer: DesignLayer } | { kind: 'resize'; id: string }

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

export function DesignEditor({ design, onChange, outline, length, width, onDragStart, onDragEnd }: DesignEditorProps): React.JSX.Element {
  const [surface, setSurface] = useState<DesignSurface>('deck')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 700, h: 320 })
  const dragRef = useRef<DragMode | null>(null)
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const [, bumpRender] = useState(0)

  const layers = layersFor(design, surface)
  const selected = layers.find((l) => l.id === selectedId) ?? null

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

  const outlineCurve = evaluateCurve(...outline, 150)

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
      ctx.beginPath()
      outlineCurve.forEach((p, i) => {
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
      } else if (layer.type === 'pdf') {
        ctx.fillStyle = '#3c3c3c'
        ctx.fillRect(-w / 2, -h / 2, w, h)
        ctx.strokeStyle = '#888'
        ctx.strokeRect(-w / 2, -h / 2, w, h)
        ctx.fillStyle = '#ccc'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('📄 PDF', 0, -4)
        ctx.font = '9px sans-serif'
        ctx.fillText(layer.name ?? '', 0, 10)
        ctx.textAlign = 'left'
      }
      ctx.restore()

      if (layer.id === selectedId) {
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate((layer.rotation * Math.PI) / 180)
        ctx.strokeStyle = '#ff9500'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.strokeRect(-w / 2, -h / 2, w, h)
        ctx.setLineDash([])
        ctx.fillStyle = '#ff9500'
        ctx.fillRect(w / 2 - HANDLE_SIZE / 2, h / 2 - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
        ctx.restore()
      }
    })
  }, [layers, outlineCurve, size, selectedId, toScreen, scale])

  const hitTestHandle = (mx: number, my: number): string | null => {
    if (!selected) return null
    const handleWorld = toWorld(selected.width / 2, selected.height / 2, selected)
    const [hx, hy] = toScreen(handleWorld)
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

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const resizeId = hitTestHandle(mx, my)
    if (resizeId) {
      dragRef.current = { kind: 'resize', id: resizeId }
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
      return
    }
    const hit = hitTestLayer(mx, my)
    if (hit) {
      setSelectedId(hit.id)
      dragRef.current = { kind: 'move', id: hit.id, startPointer: toLogical(mx, my), startLayer: { ...hit } }
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
    } else {
      setSelectedId(null)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const logical = toLogical(e.clientX - rect.left, e.clientY - rect.top)

    if (drag.kind === 'move') {
      const dx = logical.x - drag.startPointer.x
      const dy = logical.y - drag.startPointer.y
      commit(layers.map((l) => (l.id === drag.id ? { ...l, x: drag.startLayer.x + dx, y: drag.startLayer.y + dy } : l)))
    } else {
      const layer = layers.find((l) => l.id === drag.id)
      if (!layer) return
      const local = toLocal(logical.x, logical.y, layer)
      const newWidth = Math.max(MIN_SIZE, Math.abs(local.x) * 2)
      const newHeight = Math.max(MIN_SIZE, Math.abs(local.y) * 2)
      commit(layers.map((l) => (l.id === drag.id ? { ...l, width: newWidth, height: newHeight } : l)))
    }
  }

  const handlePointerUp = (): void => {
    if (dragRef.current) onDragEnd?.()
    dragRef.current = null
  }

  const addShape = (type: 'rect' | 'line'): void => {
    const layer = createLayer(type, { x: length / 2, y: 0 })
    commit([...layers, layer])
    setSelectedId(layer.id)
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
        setSelectedId(layer.id)
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
    if (selectedId === id) setSelectedId(null)
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

  const renderCleanCanvas = (): HTMLCanvasElement => {
    const pxPerCm = 8
    const c = document.createElement('canvas')
    c.width = length * pxPerCm
    c.height = width * pxPerCm
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0b0b0b'
    ctx.fillRect(0, 0, c.width, c.height)
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
      }
      ctx.restore()
    })
    return c
  }

  const exportPng = (): void => {
    renderCleanCanvas().toBlob((blob) => {
      if (blob) download(blob, `design-${surface}.png`)
    }, 'image/png')
  }

  const exportSvg = (): void => {
    const svg = exportDesignSvg(layers, length, width)
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
          <span style={{ display: 'block', color: 'var(--text-dim)', marginBottom: 2 }}>Importa PDF (anteprima segnaposto)</span>
          <input type="file" accept=".pdf" onChange={(e) => importFile(e.target.files, 'pdf')} style={{ fontSize: 11, width: '100%' }} />
        </label>

        <h3>Livelli</h3>
        {layers.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nessun elemento. Aggiungine uno sopra.</p>}
        {layers.map((l) => (
          <div
            key={l.id}
            onClick={() => setSelectedId(l.id)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              marginBottom: 4,
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
              border: '1px solid ' + (selectedId === l.id ? 'var(--accent)' : 'var(--border)')
            }}
          >
            <span>
              {l.type === 'rect' ? '▭' : l.type === 'line' ? '／' : l.type === 'image' ? '🖼' : '📄'} {l.name ?? l.type}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeLayer(l.id)
              }}
              style={{ fontSize: 11, padding: '2px 6px' }}
            >
              ✕
            </button>
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
