// 2D top-down fin placement manipulator: drag a fin marker over the board
// outline to set its distance-from-tail and rail inset directly, instead of
// only editing them as numbers. A paired side fin only needs to be dragged
// once — its mirror twin follows automatically (see updateFinPosition).
import { useCallback, useEffect, useRef, useState } from 'react'
import { evaluatePath, resampleOnX, type Point } from '../core/bezier'
import { finSlotMountPosition, updateFinPosition } from '../core/finTypes'
import type { FinSetup } from '../core/finTypes'

interface FinPlacementMapProps {
  setup: FinSetup
  onChange: (setup: FinSetup) => void
  outline: Point[]
  /** Independently-shaped left rail, only present when the board's outline is asymmetric. */
  outlineOpposite?: Point[]
  length: number
  width: number
  selectedSlotId: string | null
  onSelectSlot: (id: string) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const PADDING = 30

/** CAD-style dimension line: a segment with small perpendicular end-ticks and a centered text label on a dark backing — used to annotate fin-mounting distances (tail/rail/center) for cutting the fin boxes. */
function drawDimLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, label: string, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([3, 2])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])

  const tick = 4
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * tick
  const ny = (dx / len) * tick
  ctx.beginPath()
  ctx.moveTo(x1 - nx, y1 - ny)
  ctx.lineTo(x1 + nx, y1 + ny)
  ctx.moveTo(x2 - nx, y2 - ny)
  ctx.lineTo(x2 + nx, y2 + ny)
  ctx.stroke()

  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  ctx.font = 'bold 10px sans-serif'
  const textW = ctx.measureText(label).width
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(midX - textW / 2 - 3, midY - 9, textW + 6, 13)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.fillText(label, midX, midY + 1)
  ctx.textAlign = 'left'
  ctx.restore()
}

export function FinPlacementMap({
  setup,
  onChange,
  outline,
  outlineOpposite,
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

  const outlineCurve = evaluatePath(outline, 150)
  const outlineCurveOpposite = evaluatePath(outlineOpposite ?? outline, 150)
  const halfWidthAtX = useCallback(
    (x: number, side: number = 1) => resampleOnX(side < 0 ? outlineCurveOpposite : outlineCurve, [x])[0],
    [outlineCurve, outlineCurveOpposite]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = size.w
    canvas.height = size.h
    ctx.clearRect(0, 0, size.w, size.h)

    const drawRail = (mirror: boolean): void => {
      const curve = mirror ? outlineCurveOpposite : outlineCurve
      ctx.beginPath()
      curve.forEach((p, i) => {
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
      const side = Math.sign(slot.railInset) || 1
      const p = finSlotMountPosition(slot, length, (x) => halfWidthAtX(x, side))
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

    // Mounting-distance dimensions for the selected fin — the data needed to
    // route the fin box into the foam at the right spot once the shape is
    // final: distance from the tail tip, from the nearest rail edge, and from
    // the centerline/stringer (rail edge + center distances always sum to the
    // real half-width at that station).
    const selectedSlot = setup.slots.find((s) => s.id === selectedSlotId)
    if (selectedSlot) {
      const side = Math.sign(selectedSlot.railInset) || 1
      const mountX = length - selectedSlot.distFromTail
      const hw = halfWidthAtX(mountX, side)
      const distFromRail = Math.abs(selectedSlot.railInset)
      const distFromCenter = Math.max(hw - distFromRail, 0)
      const p = finSlotMountPosition(selectedSlot, length, (x) => halfWidthAtX(x, side))
      const [psx, psy] = toScreen(p)

      // Distance from tail: horizontal, in the top margin (clear of the NOSE/TAIL labels at the bottom).
      const dimRowY = 16
      const [tailSx] = toScreen({ x: length, y: 0 })
      ctx.strokeStyle = '#ffd60a55'
      ctx.beginPath()
      ctx.moveTo(psx, dimRowY)
      ctx.lineTo(psx, psy)
      ctx.moveTo(tailSx, dimRowY)
      ctx.lineTo(tailSx, toScreen({ x: length, y: -halfExtent + 5 })[1])
      ctx.stroke()
      drawDimLine(ctx, psx, dimRowY, tailSx, dimRowY, `Coda: ${selectedSlot.distFromTail.toFixed(1)}cm`, '#ffd60a')

      // Distance from rail edge and from centerline: two stacked vertical
      // segments just to the side of the fin marker (together they span the
      // real half-width at this station).
      const railX = psx + (side >= 0 ? 18 : -18)
      const [, centerScreenY] = toScreen({ x: mountX, y: 0 })
      const [, railScreenY] = toScreen({ x: mountX, y: side * hw })
      ctx.strokeStyle = '#5ac8fa55'
      ctx.beginPath()
      ctx.moveTo(psx, psy)
      ctx.lineTo(railX, psy)
      ctx.stroke()
      drawDimLine(ctx, railX, psy, railX, centerScreenY, `Centro: ${distFromCenter.toFixed(1)}cm`, '#5ac8fa')
      drawDimLine(ctx, railX, psy, railX, railScreenY, `Bordo: ${distFromRail.toFixed(1)}cm`, '#ff9f0a')
    }
  }, [setup.slots, outlineCurve, outlineCurveOpposite, size, selectedSlotId, toScreen, length, halfWidthAtX, halfExtent])

  const hitTest = (mx: number, my: number): string | null => {
    for (const slot of setup.slots) {
      const side = Math.sign(slot.railInset) || 1
      const p = finSlotMountPosition(slot, length, (x) => halfWidthAtX(x, side))
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
    const side = Math.sign(slot.railInset) || 1
    const hw = halfWidthAtX(length - distFromTail, side)
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
