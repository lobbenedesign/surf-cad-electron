import { useCallback, useEffect, useRef, useState } from 'react'
import { catmullRomSample } from '../core/spline'
import type { Point } from '../core/bezier'
import type { FinOutline } from '../core/finTypes'

interface FinOutlineEditorProps {
  outline: FinOutline
  height: number
  base: number
  onChange: (outline: FinOutline) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PADDING = 30

export function FinOutlineEditor({
  outline,
  height,
  base,
  onChange,
  onDragStart,
  onDragEnd
}: FinOutlineEditorProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 400, h: 400 })
  const [dragging, setDragging] = useState<number | null>(null)
  const draggingRef = useRef<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height: h } = entries[0].contentRect
      setSize({ w: Math.max(width, 100), h: Math.max(h, 100) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const maxX = Math.max(base, height) * 0.75
  const scale = Math.min((size.w - 2 * PADDING) / maxX, (size.h - 2 * PADDING) / (height * 1.1))
  const originX = PADDING + 10
  const originY = size.h - PADDING

  const toScreen = useCallback(
    (p: Point): [number, number] => [originX + p.x * scale, originY - p.y * scale],
    [originX, originY, scale]
  )
  const toLogical = useCallback(
    (sx: number, sy: number): Point => ({ x: (sx - originX) / scale, y: (originY - sy) / scale }),
    [originX, originY, scale]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = size.w
    canvas.height = size.h
    ctx.clearRect(0, 0, size.w, size.h)

    // Base line (box slot)
    const [bx0, by0] = toScreen({ x: 0, y: 0 })
    const [bx1] = toScreen({ x: base, y: 0 })
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(bx0, by0)
    ctx.lineTo(bx1, by0)
    ctx.stroke()

    // Outline
    const sampled = catmullRomSample(outline, 100)
    ctx.beginPath()
    sampled.forEach((p, i) => {
      const [sx, sy] = toScreen(p)
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
    ctx.strokeStyle = '#007aff'
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.lineTo(bx0, by0)
    ctx.closePath()
    ctx.fillStyle = 'rgba(0,122,255,0.12)'
    ctx.fill()

    // Control polygon
    ctx.beginPath()
    outline.forEach((p, i) => {
      const [sx, sy] = toScreen(p)
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
    ctx.strokeStyle = 'rgba(0,122,255,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()

    outline.forEach((p) => {
      const [sx, sy] = toScreen(p)
      ctx.beginPath()
      ctx.arc(sx, sy, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#007aff'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.fillText('BASE (box)', bx0, by0 + 18)
  }, [outline, base, height, size, toScreen])

  const hitTest = (mx: number, my: number): number | null => {
    for (let i = 0; i < outline.length; i++) {
      const [sx, sy] = toScreen(outline[i])
      if (Math.hypot(sx - mx, sy - my) < 10) return i
    }
    return null
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (hit !== null) {
      draggingRef.current = hit
      setDragging(hit)
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = draggingRef.current
    if (drag === null) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const logical = toLogical(e.clientX - rect.left, e.clientY - rect.top)
    const isBaseEnd = drag === 0 || drag === outline.length - 1
    const newOutline = outline.map((p, i) =>
      i === drag
        ? { x: Math.max(0, logical.x), y: isBaseEnd ? 0 : Math.max(0, logical.y) }
        : p
    )
    onChange(newOutline)
  }

  const handlePointerUp = (): void => {
    if (draggingRef.current !== null) onDragEnd?.()
    draggingRef.current = null
    setDragging(null)
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 260 }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: dragging !== null ? 'grabbing' : 'crosshair', display: 'block' }}
      />
    </div>
  )
}
