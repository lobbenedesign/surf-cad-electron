import { useRef, useState, useCallback, useEffect } from 'react'
import { evaluateCurve, type Point } from '../core/bezier'
import { clampCurveMonotonic } from '../core/curveConstraints'
import type { CurveCP } from '../core/types'

interface CurveDef {
  label: string
  color: string
  points: CurveCP
  /**
   * Optional transform applied to the sampled bezier points before drawing
   * (e.g. reshaping the tail into a swallow notch). Control points and the
   * control polygon are unaffected — dragging still edits the underlying
   * curve, this only changes what path gets drawn.
   */
  renderOverride?: (samples: Point[]) => Point[]
}

interface CurveEditor2DProps {
  curves: CurveDef[]
  onChange: (curveIndex: number, points: CurveCP) => void
  length: number
  /** Max value on the vertical logical axis, used for scaling. */
  maxY: number
  /** If true, mirrors each curve around y=0 (used for the symmetric outline). */
  symmetric?: boolean
  noseTailIndicators?: boolean
  /** Brackets a drag gesture so the many onChange calls it fires collapse into one undo step. */
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PADDING = 30

export function CurveEditor2D({
  curves,
  onChange,
  length,
  maxY,
  symmetric = false,
  noseTailIndicators = false,
  onDragStart,
  onDragEnd
}: CurveEditor2DProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 400 })
  const [dragging, setDragging] = useState<{ curve: number; point: number } | null>(null)
  const draggingRef = useRef<{ curve: number; point: number } | null>(null)

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

  const yTop = symmetric ? maxY : maxY
  const yBottom = symmetric ? -maxY : 0
  const yRange = yTop - yBottom

  const toScreen = useCallback(
    (p: Point): [number, number] => {
      const sx = PADDING + (p.x / length) * (size.w - 2 * PADDING)
      const sy = PADDING + (1 - (p.y - yBottom) / yRange) * (size.h - 2 * PADDING)
      return [sx, sy]
    },
    [length, size, yBottom, yRange]
  )

  const toLogical = useCallback(
    (sx: number, sy: number): Point => {
      const x = ((sx - PADDING) / (size.w - 2 * PADDING)) * length
      const y = (1 - (sy - PADDING) / (size.h - 2 * PADDING)) * yRange + yBottom
      return { x, y }
    },
    [length, size, yBottom, yRange]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = size.w
    canvas.height = size.h

    ctx.clearRect(0, 0, size.w, size.h)

    // Background grid
    ctx.strokeStyle = '#3c3c3c'
    ctx.lineWidth = 1
    for (let gx = 0; gx <= length; gx += 25) {
      const [sx] = toScreen({ x: gx, y: yBottom })
      ctx.beginPath()
      ctx.moveTo(sx, PADDING)
      ctx.lineTo(sx, size.h - PADDING)
      ctx.stroke()
    }
    // Zero axis (stringer)
    if (symmetric) {
      const [, sy0] = toScreen({ x: 0, y: 0 })
      ctx.strokeStyle = '#555'
      ctx.beginPath()
      ctx.moveTo(PADDING, sy0)
      ctx.lineTo(size.w - PADDING, sy0)
      ctx.stroke()
    }

    if (noseTailIndicators) {
      ctx.fillStyle = '#888'
      ctx.font = '11px sans-serif'
      ctx.fillText('NOSE', PADDING, size.h - 8)
      ctx.fillText('TAIL', size.w - PADDING - 24, size.h - 8)
    }

    curves.forEach((curve) => {
      const [p0, p1, p2, p3] = curve.points
      const rawSampled = evaluateCurve(p0, p1, p2, p3, 100)
      const sampled = curve.renderOverride ? curve.renderOverride(rawSampled) : rawSampled

      const drawPath = (mirror: boolean) => {
        ctx.beginPath()
        sampled.forEach((p, i) => {
          const [sx, sy] = toScreen(mirror ? { x: p.x, y: -p.y } : p)
          if (i === 0) ctx.moveTo(sx, sy)
          else ctx.lineTo(sx, sy)
        })
        ctx.strokeStyle = curve.color
        ctx.lineWidth = 2
        ctx.stroke()
      }

      drawPath(false)
      if (symmetric) drawPath(true)

      // Control polygon (faint)
      ctx.strokeStyle = curve.color + '55'
      ctx.lineWidth = 1
      ctx.beginPath()
      curve.points.forEach((p, i) => {
        const [sx, sy] = toScreen(p)
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      ctx.stroke()

      // Control points
      curve.points.forEach((p) => {
        const [sx, sy] = toScreen(p)
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fillStyle = curve.color
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
    })
  }, [curves, size, length, yBottom, yRange, symmetric, noseTailIndicators, toScreen])

  const hitTest = (mx: number, my: number): { curve: number; point: number } | null => {
    for (let ci = 0; ci < curves.length; ci++) {
      for (let pi = 0; pi < curves[ci].points.length; pi++) {
        const [sx, sy] = toScreen(curves[ci].points[pi])
        if (Math.hypot(sx - mx, sy - my) < 9) return { curve: ci, point: pi }
      }
    }
    return null
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hit = hitTest(mx, my)
    if (hit) {
      draggingRef.current = hit
      setDragging(hit)
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = draggingRef.current
    if (!drag) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const logical = toLogical(mx, my)

    let newPoints = [...curves[drag.curve].points] as CurveCP
    // Endpoints (nose/tail) stay pinned on the X axis; interior points free.
    const isEndpoint = drag.point === 0 || drag.point === 3
    newPoints[drag.point] = {
      x: isEndpoint ? newPoints[drag.point].x : Math.max(0, Math.min(length, logical.x)),
      y: Math.max(symmetric ? -maxY : 0, Math.min(maxY, logical.y))
    }
    // Keep interior points from crossing their neighbors in x, so the curve can
    // never fold back on itself (see core/curveConstraints.ts).
    newPoints = clampCurveMonotonic(newPoints, drag.point)
    onChange(drag.curve, newPoints)
  }

  const handlePointerUp = (): void => {
    if (draggingRef.current) onDragEnd?.()
    draggingRef.current = null
    setDragging(null)
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: dragging ? 'grabbing' : 'crosshair', display: 'block' }}
      />
    </div>
  )
}
