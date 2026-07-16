// 2D top-down fin placement manipulator: drag a fin marker over the board
// outline to set its distance-from-tail and rail inset directly, instead of
// only editing them as numbers. A paired side fin only needs to be dragged
// once — its mirror twin follows automatically (see updateFinPosition).
import { useCallback, useEffect, useRef, useState } from 'react'
import { evaluateCurve, resampleOnX, type Point } from '../core/bezier'
import { finSlotMountPosition, updateFinPosition } from '../core/finTypes'
import type { FinSetup } from '../core/finTypes'
import type { CurveCP } from '../core/types'

interface FinPlacementMapProps {
  setup: FinSetup
  onChange: (setup: FinSetup) => void
  outline: CurveCP
  length: number
  width: number
  selectedSlotId: string | null
  onSelectSlot: (id: string) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PADDING = 30

export function FinPlacementMap({
  setup,
  onChange,
  outline,
  length,
  width,
  selectedSlotId,
  onSelectSlot,
  onDragStart,
  onDragEnd
}: FinPlacementMapProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 500, h: 260 })
  const draggingRef = useRef<string | null>(null)

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

  const toLogical = useCallback(
    (sx: number, sy: number): Point => {
      const x = ((sx - PADDING) / (size.w - 2 * PADDING)) * length
      const y = (1 - (sy - PADDING) / (size.h - 2 * PADDING)) * yRange - halfExtent
      return { x, y }
    },
    [length, size, halfExtent, yRange]
  )

  const outlineCurve = evaluateCurve(...outline, 150)
  const halfWidthAtX = useCallback((x: number) => resampleOnX(outlineCurve, [x])[0], [outlineCurve])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = size.w
    canvas.height = size.h
    ctx.clearRect(0, 0, size.w, size.h)

    const drawRail = (mirror: boolean): void => {
      ctx.beginPath()
      outlineCurve.forEach((p, i) => {
        const [sx, sy] = toScreen(mirror ? { x: p.x, y: -p.y } : p)
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      ctx.strokeStyle = '#555'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    drawRail(false)
    drawRail(true)

    const [, centerlineY] = toScreen({ x: 0, y: 0 })
    ctx.strokeStyle = '#3c3c3c'
    ctx.beginPath()
    ctx.moveTo(PADDING, centerlineY)
    ctx.lineTo(size.w - PADDING, centerlineY)
    ctx.stroke()

    ctx.fillStyle = '#888'
    ctx.font = '11px sans-serif'
    ctx.fillText('NOSE', PADDING, size.h - 8)
    ctx.fillText('TAIL', size.w - PADDING - 24, size.h - 8)

    setup.slots.forEach((slot) => {
      const p = finSlotMountPosition(slot, length, halfWidthAtX)
      const [sx, sy] = toScreen(p)
      ctx.beginPath()
      ctx.arc(sx, sy, 7, 0, Math.PI * 2)
      ctx.fillStyle = slot.id === selectedSlotId ? '#ff9500' : '#007aff'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#ccc'
      ctx.font = '10px sans-serif'
      ctx.fillText(slot.label, sx + 9, sy + 3)
    })
  }, [setup.slots, outlineCurve, size, selectedSlotId, toScreen, length, halfWidthAtX])

  const hitTest = (mx: number, my: number): string | null => {
    for (const slot of setup.slots) {
      const p = finSlotMountPosition(slot, length, halfWidthAtX)
      const [sx, sy] = toScreen(p)
      if (Math.hypot(sx - mx, sy - my) < 10) return slot.id
    }
    return null
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) {
      draggingRef.current = hit
      onSelectSlot(hit)
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      onDragStart?.()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const slotId = draggingRef.current
    if (!slotId) return
    const slot = setup.slots.find((s) => s.id === slotId)
    if (!slot) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const logical = toLogical(e.clientX - rect.left, e.clientY - rect.top)

    const distFromTail = length - Math.max(0, Math.min(length, logical.x))
    if (slot.railInset === 0) {
      onChange(updateFinPosition(setup, slotId, { distFromTail }))
      return
    }
    // Side (sign of railInset) is fixed by the slot — dragging past the centerline
    // just clamps the inset toward 0, it never flips the fin to the other rail.
    const hw = halfWidthAtX(length - distFromTail)
    const side = Math.sign(slot.railInset)
    const railInset = Math.max(0, hw - Math.max(side * logical.y, 0))
    onChange(updateFinPosition(setup, slotId, { distFromTail, railInset }))
  }

  const handlePointerUp = (): void => {
    if (draggingRef.current) onDragEnd?.()
    draggingRef.current = null
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 180 }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: draggingRef.current ? 'grabbing' : 'crosshair', display: 'block' }}
      />
    </div>
  )
}
