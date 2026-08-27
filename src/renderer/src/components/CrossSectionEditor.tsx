import { useCallback, useEffect, useRef, useState } from 'react'
import { buildFullRailLoop, type CrossSectionStation } from '../core/crossSection'
import type { Point } from '../core/bezier'
import { chamferVertex, extendVertex, filletVertex, trimVertex } from '../core/sketchTools'

interface CrossSectionEditorProps {
  stations: CrossSectionStation[]
  onChange: (stationIndex: number, points: Point[]) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PADDING = 24

export function CrossSectionEditor({ stations, onChange, onDragStart, onDragEnd }: CrossSectionEditorProps): React.JSX.Element {
  const [stationIdx, setStationIdx] = useState(4)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 500, h: 400 })
  const [dragging, setDragging] = useState<number | null>(null)
  const draggingRef = useRef<number | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [toolAmount, setToolAmount] = useState(0.08)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ w: Math.max(width, 100), h: Math.max(height, 100) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Square-ish plot area, u: -1.3..1.3, v: -0.15..1.15
  const uRange = 2.6
  const vRange = 1.3
  const scale = Math.min((size.w - 2 * PADDING) / uRange, (size.h - 2 * PADDING) / vRange)
  const originX = size.w / 2
  const originY = PADDING + vRange * scale - 0.15 * scale

  const toScreen = useCallback(
    (p: Point): [number, number] => [originX + p.x * scale, originY - p.y * scale],
    [originX, originY, scale]
  )
  const toLogical = useCallback(
    (sx: number, sy: number): Point => ({ x: (sx - originX) / scale, y: -(sy - originY) / scale }),
    [originX, originY, scale]
  )

  const station = stations[stationIdx]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !station) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = size.w
    canvas.height = size.h
    ctx.clearRect(0, 0, size.w, size.h)

    // Ghost profiles of all other stations
    stations.forEach((s, i) => {
      if (i === stationIdx) return
      const loop = buildFullRailLoop(s.points, 20)
      ctx.beginPath()
      loop.forEach((p, j) => {
        const [sx, sy] = toScreen(p)
        if (j === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.stroke()
    })

    // Axes
    ctx.strokeStyle = '#555'
    const [ax0] = toScreen({ x: -1.3, y: 0 })
    const [ax1] = toScreen({ x: 1.3, y: 0 })
    const [, ay0] = toScreen({ x: 0, y: 0 })
    ctx.beginPath()
    ctx.moveTo(ax0, ay0)
    ctx.lineTo(ax1, ay0)
    ctx.strokeStyle = '#4a4a4a'
    ctx.stroke()
    const [sx0] = toScreen({ x: 0, y: 0 })
    ctx.beginPath()
    ctx.moveTo(sx0, PADDING)
    ctx.lineTo(sx0, size.h - PADDING)
    ctx.stroke()

    // Current station full rail loop (smooth)
    const loop = buildFullRailLoop(station.points, 32)
    ctx.beginPath()
    loop.forEach((p, i) => {
      const [sx, sy] = toScreen(p)
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(0, 122, 255, 0.15)'
    ctx.fill()
    ctx.strokeStyle = '#007aff'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Control polygon (half profile, right side)
    ctx.beginPath()
    station.points.forEach((p, i) => {
      const [sx, sy] = toScreen(p)
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
    ctx.strokeStyle = 'rgba(0, 122, 255, 0.4)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Control points
    station.points.forEach((p, i) => {
      const [sx, sy] = toScreen(p)
      const isSelected = i === selectedIdx
      ctx.beginPath()
      ctx.arc(sx, sy, isSelected ? 8 : 6, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? '#ff9f0a' : '#007aff'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.fillText('bottom', size.w / 2 - 18, size.h - 8)
    ctx.fillText('deck', size.w / 2 - 12, PADDING + 12)
  }, [station, stations, stationIdx, size, toScreen, selectedIdx])

  const hitTest = (mx: number, my: number): number | null => {
    if (!station) return null
    for (let i = 0; i < station.points.length; i++) {
      const [sx, sy] = toScreen(station.points[i])
      if (Math.hypot(sx - mx, sy - my) < 10) return i
    }
    return null
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hit = hitTest(mx, my)
    if (hit !== null) {
      setSelectedIdx(hit)
      draggingRef.current = hit
      setDragging(hit)
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = draggingRef.current
    if (drag === null || !station) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const logical = toLogical(e.clientX - rect.left, e.clientY - rect.top)
    const isEnd = drag === 0 || drag === station.points.length - 1
    const newPoints = station.points.map((p, i) =>
      i === drag
        ? {
            x: isEnd ? 0 : Math.max(0, Math.min(1.2, logical.x)),
            y: Math.max(0, Math.min(1, logical.y))
          }
        : p
    )
    onChange(stationIdx, newPoints)
  }

  const handlePointerUp = (): void => {
    if (draggingRef.current !== null) onDragEnd?.()
    draggingRef.current = null
    setDragging(null)
  }

  const addPoint = (): void => {
    stations.forEach((s, si) => {
      const mid = Math.floor(s.points.length / 2)
      const a = s.points[mid - 1]
      const b = s.points[mid]
      const newPt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const pts = [...s.points]
      pts.splice(mid, 0, newPt)
      onChange(si, pts)
    })
  }

  const removePoint = (): void => {
    if (!station || station.points.length <= 3) return
    stations.forEach((s, si) => {
      const mid = Math.floor(s.points.length / 2)
      const pts = s.points.filter((_, i) => i !== mid)
      onChange(si, pts)
    })
  }

  const isInteriorSelected = selectedIdx !== null && selectedIdx > 0 && selectedIdx < (station?.points.length ?? 0) - 1

  const applyFillet = (): void => {
    if (!station || selectedIdx === null) return
    onDragStart?.()
    onChange(stationIdx, filletVertex(station.points, selectedIdx, toolAmount))
    onDragEnd?.()
    setSelectedIdx(null)
  }

  const applyChamfer = (): void => {
    if (!station || selectedIdx === null) return
    onDragStart?.()
    onChange(stationIdx, chamferVertex(station.points, selectedIdx, toolAmount))
    onDragEnd?.()
    setSelectedIdx(null)
  }

  const applyTrim = (): void => {
    if (!station || selectedIdx === null) return
    onDragStart?.()
    onChange(stationIdx, trimVertex(station.points, selectedIdx))
    onDragEnd?.()
    setSelectedIdx(null)
  }

  const applyExtend = (): void => {
    if (!station || selectedIdx === null) return
    onDragStart?.()
    onChange(stationIdx, extendVertex(station.points, selectedIdx, toolAmount))
    onDragEnd?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 90 }}>
          Stazione: {(station?.position * 100).toFixed(1)}%
        </span>
        <input
          type="range"
          min={0}
          max={stations.length - 1}
          value={stationIdx}
          onChange={(e) => setStationIdx(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>NOSE</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>TAIL</span>
        <button onClick={addPoint} style={{ marginLeft: 12 }}>
          ➕ Punto
        </button>
        <button onClick={removePoint}>➖ Punto</button>
      </div>
      <div
        className="ref-image-bar"
        style={{ opacity: isInteriorSelected ? 1 : 0.5 }}
      >
        <span style={{ color: 'var(--text-dim)' }}>
          {isInteriorSelected ? `Punto ${selectedIdx} selezionato` : 'Seleziona un punto interno per fillet/chamfer/trim/extend'}
        </span>
        <label>
          Raggio/distanza
          <input
            type="number"
            step={0.01}
            min={0.01}
            max={0.5}
            value={toolAmount}
            onChange={(e) => setToolAmount(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </label>
        <button onClick={applyFillet} disabled={!isInteriorSelected}>
          ⌒ Fillet
        </button>
        <button onClick={applyChamfer} disabled={!isInteriorSelected}>
          ⟋ Chamfer
        </button>
        <button onClick={applyTrim} disabled={!isInteriorSelected}>
          ✂️ Trim
        </button>
        <button onClick={applyExtend} disabled={!isInteriorSelected}>
          ↔️ Extend
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ cursor: dragging !== null ? 'grabbing' : 'crosshair', display: 'block' }}
        />
      </div>
    </div>
  )
}
