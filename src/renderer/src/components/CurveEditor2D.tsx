import { useRef, useState, useCallback, useEffect } from 'react'
import { evaluatePath, type Point } from '../core/bezier'
import { applyTangentLock, clampCurveMonotonic, type TangentLock } from '../core/curveConstraints'
import { appendPathSegment, mirrorOppositeHandle, nearestPointOnPath, removePathPoint, splitPathSegment } from '../core/outlinePath'
import type { ReferenceImage } from '../core/referenceImage'

interface CurveDef {
  label: string
  color: string
  points: Point[]
  /**
   * Optional transform applied to the sampled bezier points before drawing
   * (e.g. reshaping the tail into a swallow notch). Control points and the
   * control polygon are unaffected — dragging still edits the underlying
   * curve, this only changes what path gets drawn.
   */
  renderOverride?: (samples: Point[]) => Point[]
  /** Dashed stroke, no control points, not draggable — used for ghost/reference overlays. */
  readOnly?: boolean
  /**
   * Opt-in 4-bit tangent-lock (core/curveConstraints.ts) clamping the handle
   * next to each endpoint against that endpoint's own anchor position —
   * `start` for points[1] vs points[0], `end` for the second-to-last point vs
   * the last. Undefined/all-false bits = today's unclamped free-drag.
   */
  tangentLocks?: { start?: TangentLock; end?: TangentLock }
}

interface CurveEditor2DProps {
  curves: CurveDef[]
  onChange: (curveIndex: number, points: Point[]) => void
  length: number
  /** Max value on the vertical logical axis, used for scaling. */
  maxY: number
  /** If true, mirrors each curve around y=0 (used for the symmetric outline). */
  symmetric?: boolean
  /**
   * When `symmetric` is false, curves[0] and curves[asymmetricPairIndex] are
   * two independently-edited rails that together form one closed shape —
   * curves[0] drawn forward then the paired curve's samples drawn backward
   * (negated), closed into a single stroke. The paired curve's own stroke is
   * skipped (it's included in the combined shape); its control points still
   * draw and drag normally.
   */
  asymmetricPairIndex?: number
  noseTailIndicators?: boolean
  /** Brackets a drag gesture so the many onChange calls it fires collapse into one undo step. */
  onDragStart?: () => void
  onDragEnd?: () => void
  /** Trace-image drawn behind the grid/curves, e.g. a scanned board photo to digitize over. */
  backgroundImage?: ReferenceImage | null
  /**
   * 'edit' (default): drag control points. 'digitize': clicks call
   * onDigitizeClick instead of dragging, for tracing points off a reference
   * image. 'measure': click two points to show a persistent distance/angle
   * readout between them. 'draw': clicks extend curves[0] (or the paired
   * curve, chosen by which side of the centerline the click lands on) with a
   * new segment — only meaningful when allowPathEditing is set.
   */
  interactionMode?: 'edit' | 'digitize' | 'measure' | 'draw'
  digitizedPoints?: Point[]
  onDigitizeClick?: (p: Point) => void
  /**
   * Enables variable-point-count editing on curves[0] (and, if paired,
   * curves[asymmetricPairIndex]): double-click the stroke to insert an
   * anchor there, select a point + Delete/Backspace to remove it (an
   * interior anchor merges its two segments; an end anchor drops that whole
   * end segment). Off by default — Rocker/Deck stay fixed 4-point curves.
   */
  allowPathEditing?: boolean
  /** Fires whenever the selected control point changes (including to null) — lets a parent offer point-targeted tools (fillet/chamfer/extend) outside this component. */
  onSelectedPointChange?: (selected: { curve: number; point: number } | null) => void
  /**
   * When true (and `allowPathEditing` is set), dragging one handle of an
   * interior path anchor mirrors the opposite handle to keep the curve
   * tangent-smooth through that point (see `mirrorOppositeHandle`) — the
   * classic vector-editor "smooth anchor" behavior. Off by default (today's
   * independent-handle drag is unchanged unless opted in).
   */
  smoothAnchors?: boolean
}

const PADDING = 30
const INSERT_HIT_PX = 18

export function CurveEditor2D({
  curves,
  onChange,
  length,
  maxY,
  symmetric = false,
  asymmetricPairIndex,
  noseTailIndicators = false,
  onDragStart,
  onDragEnd,
  backgroundImage = null,
  interactionMode = 'edit',
  digitizedPoints = [],
  onDigitizeClick,
  allowPathEditing = false,
  onSelectedPointChange,
  smoothAnchors = false
}: CurveEditor2DProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 400 })
  const [dragging, setDragging] = useState<{ curve: number; point: number } | null>(null)
  const draggingRef = useRef<{ curve: number; point: number } | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<{ curve: number; point: number } | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const [, forceRerender] = useState(0)
  const [measurePoints, setMeasurePoints] = useState<Point[]>([])

  useEffect(() => {
    onSelectedPointChange?.(selectedPoint)
  }, [selectedPoint, onSelectedPointChange])

  useEffect(() => {
    if (!backgroundImage) return
    if (imageCacheRef.current.has(backgroundImage.dataUrl)) return
    const img = new Image()
    img.onload = () => forceRerender((n) => n + 1)
    img.src = backgroundImage.dataUrl
    imageCacheRef.current.set(backgroundImage.dataUrl, img)
  }, [backgroundImage])

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

  // The vertical *display* range spans ±maxY whenever the drawn shape itself
  // goes negative — true for a mirrored symmetric curve, and equally true for
  // an asymmetric pair (curve0 + curve[asymmetricPairIndex] combined into one
  // closed shape via the paired curve's negated samples). Dragging still
  // clamps each control point's own y to [0, maxY] in both cases (see
  // handlePointerMove) — only the axis/grid mapping needs the full range.
  const showsNegativeHalf = symmetric || asymmetricPairIndex !== undefined
  const yTop = maxY
  const yBottom = showsNegativeHalf ? -maxY : 0
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

    // Trace-image reference, drawn first so the grid/curves sit on top of it.
    if (backgroundImage) {
      const img = imageCacheRef.current.get(backgroundImage.dataUrl)
      if (img && img.complete && img.naturalWidth > 0) {
        const [sx0, sy0] = toScreen({ x: backgroundImage.x, y: backgroundImage.y + backgroundImage.heightCm })
        const [sx1, sy1] = toScreen({ x: backgroundImage.x + backgroundImage.widthCm, y: backgroundImage.y })
        ctx.save()
        ctx.globalAlpha = backgroundImage.opacity
        if (backgroundImage.mirror) {
          ctx.translate(sx0, 0)
          ctx.scale(-1, 1)
          ctx.drawImage(img, -(sx1 - sx0), sy0, sx1 - sx0, sy1 - sy0)
        } else {
          ctx.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0)
        }
        ctx.restore()
      }
    }

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
    if (symmetric || asymmetricPairIndex !== undefined) {
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

    // Sample every curve up front (with its own renderOverride applied) so the
    // asymmetric-pair draw below can combine two curves' samples into one shape.
    const allSampled = curves.map((curve) => {
      const raw = evaluatePath(curve.points, 100)
      return curve.renderOverride ? curve.renderOverride(raw) : raw
    })

    const strokeSetup = (curve: CurveDef): void => {
      ctx.strokeStyle = curve.color
      ctx.lineWidth = 2
      ctx.setLineDash(curve.readOnly ? [6, 4] : [])
    }

    const drawPath = (curve: CurveDef, sampled: Point[]): void => {
      ctx.beginPath()
      sampled.forEach((p, i) => {
        const [sx, sy] = toScreen(p)
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      strokeSetup(curve)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Symmetric curves (e.g. the outline) are one physical closed shape: draw
    // nose->tail then back tail->nose along the mirror as a single closed path,
    // so nose and tail are always joined regardless of endpoint y (square/swallow/
    // round tails all close correctly) instead of two disconnected open strokes.
    const drawClosedSymmetric = (curve: CurveDef, sampled: Point[]): void => {
      ctx.beginPath()
      sampled.forEach((p, i) => {
        const [sx, sy] = toScreen(p)
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      for (let i = sampled.length - 1; i >= 0; i--) {
        const [sx, sy] = toScreen({ x: sampled[i].x, y: -sampled[i].y })
        ctx.lineTo(sx, sy)
      }
      ctx.closePath()
      strokeSetup(curve)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Asymmetric pair: curve0 forward + the paired curve's own (independently
    // shaped) samples reversed and negated, closed into one shape.
    const drawClosedPair = (curve: CurveDef, primary: Point[], secondary: Point[]): void => {
      ctx.beginPath()
      primary.forEach((p, i) => {
        const [sx, sy] = toScreen(p)
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      for (let i = secondary.length - 1; i >= 0; i--) {
        const [sx, sy] = toScreen({ x: secondary[i].x, y: -secondary[i].y })
        ctx.lineTo(sx, sy)
      }
      ctx.closePath()
      strokeSetup(curve)
      ctx.stroke()
      ctx.setLineDash([])
    }

    curves.forEach((curve, ci) => {
      const sampled = allSampled[ci]
      const isPaired = asymmetricPairIndex !== undefined && !symmetric
      // The paired secondary curve (e.g. the left rail) is stored as a plain
      // positive magnitude, same as the primary — its control points/polygon
      // are drawn negated so they sit where its stroke visually is (the
      // bottom half), not overlapping the primary curve's points up top.
      const isPairedSecondary = isPaired && ci === asymmetricPairIndex
      const displayPoint = (p: Point): Point => (isPairedSecondary ? { x: p.x, y: -p.y } : p)

      if (isPairedSecondary) {
        // Its stroke is drawn as part of curve 0's combined shape below — skip here.
      } else if (isPaired && ci === 0) {
        drawClosedPair(curve, sampled, allSampled[asymmetricPairIndex] ?? sampled)
      } else if (symmetric) {
        drawClosedSymmetric(curve, sampled)
      } else {
        drawPath(curve, sampled)
      }

      if (curve.readOnly) return

      // Control polygon (faint)
      ctx.strokeStyle = curve.color + '55'
      ctx.lineWidth = 1
      ctx.beginPath()
      curve.points.forEach((p, i) => {
        const [sx, sy] = toScreen(displayPoint(p))
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
      ctx.stroke()

      // Control points
      curve.points.forEach((p, pi) => {
        const [sx, sy] = toScreen(displayPoint(p))
        const isSelected = allowPathEditing && selectedPoint?.curve === ci && selectedPoint?.point === pi
        ctx.beginPath()
        ctx.arc(sx, sy, isSelected ? 7 : 5, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? '#ff9f0a' : curve.color
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })
    })

    // Digitized points (trace-image click-to-mark)
    digitizedPoints.forEach((p) => {
      const [sx, sy] = toScreen(p)
      ctx.beginPath()
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ff453a'
      ctx.fill()
    })

    // Measure tool: dashed line + distance/angle label between the two clicked points
    if (measurePoints.length === 2) {
      const [a, b] = measurePoints
      const [sxa, sya] = toScreen(a)
      const [sxb, syb] = toScreen(b)
      ctx.beginPath()
      ctx.moveTo(sxa, sya)
      ctx.lineTo(sxb, syb)
      ctx.strokeStyle = '#ffd60a'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
      ;[
        [sxa, sya],
        [sxb, syb]
      ].forEach(([sx, sy]) => {
        ctx.beginPath()
        ctx.arc(sx, sy, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#ffd60a'
        ctx.fill()
      })
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      const midX = (sxa + sxb) / 2
      const midY = (sya + syb) / 2
      const label = `${dist.toFixed(2)} cm · ${angle.toFixed(1)}°`
      ctx.font = 'bold 12px sans-serif'
      const textW = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(midX - textW / 2 - 4, midY - 20, textW + 8, 18)
      ctx.fillStyle = '#ffd60a'
      ctx.textAlign = 'center'
      ctx.fillText(label, midX, midY - 6)
      ctx.textAlign = 'left'
    }
  }, [
    curves,
    size,
    length,
    yBottom,
    yRange,
    symmetric,
    asymmetricPairIndex,
    noseTailIndicators,
    toScreen,
    backgroundImage,
    digitizedPoints,
    measurePoints,
    allowPathEditing,
    selectedPoint
  ])

  // The paired secondary curve is displayed negated (see displayPoint in the
  // draw effect) — hit-testing and dragging must mirror that same negation to
  // stay consistent with what's on screen.
  const isPairedSecondaryCurve = (ci: number): boolean =>
    asymmetricPairIndex !== undefined && !symmetric && ci === asymmetricPairIndex

  const hitTest = (mx: number, my: number): { curve: number; point: number } | null => {
    for (let ci = 0; ci < curves.length; ci++) {
      if (curves[ci].readOnly) continue
      const mirror = isPairedSecondaryCurve(ci)
      for (let pi = 0; pi < curves[ci].points.length; pi++) {
        const p = curves[ci].points[pi]
        const [sx, sy] = toScreen(mirror ? { x: p.x, y: -p.y } : p)
        if (Math.hypot(sx - mx, sy - my) < 9) return { curve: ci, point: pi }
      }
    }
    return null
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (interactionMode === 'digitize') {
      onDigitizeClick?.(toLogical(mx, my))
      return
    }
    if (interactionMode === 'measure') {
      const p = toLogical(mx, my)
      setMeasurePoints((pts) => (pts.length >= 2 ? [p] : [...pts, p]))
      return
    }
    if (interactionMode === 'draw') {
      if (!allowPathEditing) return
      const logical = toLogical(mx, my)
      const useSecondary = asymmetricPairIndex !== undefined && !symmetric && logical.y < 0
      const targetIdx = useSecondary ? (asymmetricPairIndex as number) : 0
      const target = curves[targetIdx]
      if (!target || target.readOnly) return
      const point = useSecondary ? { x: logical.x, y: -logical.y } : logical
      onDragStart?.()
      onChange(targetIdx, appendPathSegment(target.points, point))
      onDragEnd?.()
      return
    }

    const hit = hitTest(mx, my)
    if (hit) {
      setSelectedPoint(hit)
      draggingRef.current = hit
      setDragging(hit)
      ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
      ;(e.target as HTMLCanvasElement).focus()
      onDragStart?.()
    } else {
      setSelectedPoint(null)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!allowPathEditing || interactionMode !== 'edit') return
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const logical = toLogical(mx, my)

    const editableIndices = [0, ...(asymmetricPairIndex !== undefined && !symmetric ? [asymmetricPairIndex] : [])]
    let best: { ci: number; segmentIndex: number; t: number; screenDist: number } | null = null
    for (const ci of editableIndices) {
      const curve = curves[ci]
      if (!curve || curve.readOnly) continue
      const mirror = isPairedSecondaryCurve(ci)
      // Compare against the curve's own logical space (negate the click's y
      // back to match how the secondary curve's points are actually stored).
      const searchLogical = mirror ? { x: logical.x, y: -logical.y } : logical
      const nearest = nearestPointOnPath(curve.points, searchLogical)
      const [nsx, nsy] = toScreen(mirror ? { x: nearest.point.x, y: -nearest.point.y } : nearest.point)
      const screenDist = Math.hypot(nsx - mx, nsy - my)
      if (!best || screenDist < best.screenDist) {
        best = { ci, segmentIndex: nearest.segmentIndex, t: nearest.t, screenDist }
      }
    }
    if (!best || best.screenDist > INSERT_HIT_PX) return

    const newPoints = splitPathSegment(curves[best.ci].points, best.segmentIndex, best.t)
    onDragStart?.()
    onChange(best.ci, newPoints)
    onDragEnd?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if (!allowPathEditing || !selectedPoint) return
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    const curve = curves[selectedPoint.curve]
    if (!curve || curve.readOnly) return
    const newPoints = removePathPoint(curve.points, selectedPoint.point)
    if (newPoints === curve.points) return
    e.preventDefault()
    onDragStart?.()
    onChange(selectedPoint.curve, newPoints)
    onDragEnd?.()
    setSelectedPoint(null)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const drag = draggingRef.current
    if (!drag) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const logical = toLogical(mx, my)

    const points = curves[drag.curve].points
    let newPoints = points.map((p) => ({ ...p }))
    // Endpoints (nose/tail) stay pinned on the X axis; interior points free.
    const isEndpoint = drag.point === 0 || drag.point === newPoints.length - 1
    // The paired secondary curve is displayed negated (bottom half) but stored
    // as a plain positive magnitude — negate the pointer's y back before
    // clamping/storing so dragging follows the cursor correctly.
    const rawY = isPairedSecondaryCurve(drag.curve) ? -logical.y : logical.y
    newPoints[drag.point] = {
      x: isEndpoint ? newPoints[drag.point].x : Math.max(0, Math.min(length, logical.x)),
      y: Math.max(symmetric ? -maxY : 0, Math.min(maxY, rawY))
    }
    // Keep interior points from crossing their neighbors in x, so the curve can
    // never fold back on itself (see core/curveConstraints.ts).
    newPoints = clampCurveMonotonic(newPoints, drag.point)

    // Opt-in tangent-lock: clamp the handle next to an endpoint against that
    // endpoint's own anchor position (see core/curveConstraints.ts v3).
    const locks = curves[drag.curve].tangentLocks
    if (locks?.start && drag.point === 1) {
      newPoints[1] = applyTangentLock(newPoints[1], newPoints[0], locks.start)
    } else if (locks?.end && drag.point === newPoints.length - 2) {
      newPoints[drag.point] = applyTangentLock(newPoints[drag.point], newPoints[newPoints.length - 1], locks.end)
    }

    // Opt-in smooth-anchor constraint: mirror the opposite handle of the same
    // interior anchor to keep the curve tangent-continuous through it.
    if (smoothAnchors && allowPathEditing) {
      newPoints = mirrorOppositeHandle(newPoints, drag.point)
    }

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
        tabIndex={allowPathEditing ? 0 : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        style={{ cursor: dragging ? 'grabbing' : 'crosshair', display: 'block', outline: 'none' }}
      />
    </div>
  )
}
