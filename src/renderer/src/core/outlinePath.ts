// Editing primitives for the variable-length multi-segment outline path (see
// OutlinePath in types.ts: length 3k+1, anchors at indices 0,3,6..., handles
// between). Lets the Outline curve grow/shrink point count instead of being a
// fixed single 4-point bezier — add/remove/extend/join operations the user
// drives from CurveEditor2D's double-click / Delete-key / draw-mode.

import { cubicBezier, evaluatePath, resampleOnX } from './bezier'
import type { Point } from './bezier'
import type { BoardState } from './types'
import { chamferVertex, extendVertex, filletVertex } from './sketchTools'

export function segmentCount(path: Point[]): number {
  return Math.max(1, Math.round((path.length - 1) / 3))
}

export function isAnchorIndex(index: number): boolean {
  return index % 3 === 0
}

/**
 * "Smooth point" tangent constraint: after handle `draggedIndex` moves, rotates
 * the OTHER handle on the opposite side of the same anchor to stay collinear
 * through it (opposite direction, same anchor), preserving that other handle's
 * own length from the anchor — the classic vector-editor behavior for a
 * smooth (non-corner) anchor. No-op if `draggedIndex` is itself an anchor, if
 * the anchor is a path endpoint (no opposite side exists), or if the dragged
 * handle sits exactly on its anchor (no direction to mirror).
 */
export function mirrorOppositeHandle(path: Point[], draggedIndex: number): Point[] {
  const mod = draggedIndex % 3
  if (mod === 0) return path
  const anchorIndex = mod === 1 ? draggedIndex - 1 : draggedIndex + 1
  const oppositeIndex = mod === 1 ? draggedIndex - 2 : draggedIndex + 2
  if (oppositeIndex < 0 || oppositeIndex >= path.length) return path
  const anchor = path[anchorIndex]
  const dragged = path[draggedIndex]
  const opposite = path[oppositeIndex]
  const dx = anchor.x - dragged.x
  const dy = anchor.y - dragged.y
  const dirLen = Math.hypot(dx, dy)
  if (dirLen < 1e-9) return path
  const oppLen = Math.hypot(opposite.x - anchor.x, opposite.y - anchor.y)
  const ux = dx / dirLen
  const uy = dy / dirLen
  const next = path.map((p) => ({ ...p }))
  next[oppositeIndex] = { x: anchor.x + ux * oppLen, y: anchor.y + uy * oppLen }
  return next
}

/** Splits segment `segmentIndex` at parameter `t` (De Casteljau), replacing its 4 control points with 7 (one extra anchor, two new segments). */
export function splitPathSegment(path: Point[], segmentIndex: number, t: number): Point[] {
  const base = segmentIndex * 3
  const [p0, p1, p2, p3] = [path[base], path[base + 1], path[base + 2], path[base + 3]]
  const lerp = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const p01 = lerp(p0, p1)
  const p12 = lerp(p1, p2)
  const p23 = lerp(p2, p3)
  const p012 = lerp(p01, p12)
  const p123 = lerp(p12, p23)
  const m = lerp(p012, p123)
  return [...path.slice(0, base), p0, p01, p012, m, p123, p23, p3, ...path.slice(base + 4)]
}

/**
 * Removes the anchor at `anchorIndex` (must be an anchor, i.e. a multiple of 3).
 * An interior anchor merges its two flanking segments into one (drops the
 * anchor + its two adjacent handles). The first/last anchor instead drops its
 * entire outer segment (shortens the path — "delete unneeded segment" from an
 * over-extended draw). No-op if the path only has one segment left, or if
 * `anchorIndex` isn't an anchor.
 */
export function removePathPoint(path: Point[], anchorIndex: number): Point[] {
  if (!isAnchorIndex(anchorIndex) || anchorIndex < 0 || anchorIndex >= path.length) return path
  if (segmentCount(path) <= 1) return path
  if (anchorIndex === 0) return path.slice(3)
  if (anchorIndex === path.length - 1) return path.slice(0, path.length - 3)
  return [...path.slice(0, anchorIndex - 1), ...path.slice(anchorIndex + 2)]
}

/** Appends a new segment extending the path from its current last anchor to `to`, with straight-line handles as a sensible default (the user can drag them afterward). */
export function appendPathSegment(path: Point[], to: Point): Point[] {
  const last = path[path.length - 1]
  const h1 = { x: last.x + (to.x - last.x) / 3, y: last.y + (to.y - last.y) / 3 }
  const h2 = { x: last.x + (to.x - last.x) * (2 / 3), y: last.y + (to.y - last.y) * (2 / 3) }
  return [...path, h1, h2, to]
}

/** Prepends a new segment extending the path backwards from its current first anchor to `from`. */
export function prependPathSegment(path: Point[], from: Point): Point[] {
  const first = path[0]
  const h1 = { x: from.x + (first.x - from.x) / 3, y: from.y + (first.y - from.y) / 3 }
  const h2 = { x: from.x + (first.x - from.x) * (2 / 3), y: from.y + (first.y - from.y) * (2 / 3) }
  return [from, h1, h2, ...path]
}

/** Brute-force nearest point on the sampled path to `target`, for double-click-to-insert hit-testing. Returns the owning segment index and its local parameter t. */
export function nearestPointOnPath(
  path: Point[],
  target: Point,
  stepsPerSegment = 60
): { segmentIndex: number; t: number; point: Point; distSq: number } {
  const segs = segmentCount(path)
  let best = { segmentIndex: 0, t: 0, point: path[0], distSq: Infinity }
  for (let s = 0; s < segs; s++) {
    const base = s * 3
    const p0 = path[base]
    const p1 = path[base + 1]
    const p2 = path[base + 2]
    const p3 = path[base + 3]
    for (let i = 0; i <= stepsPerSegment; i++) {
      const t = i / stepsPerSegment
      const point = { x: cubicBezier(t, p0.x, p1.x, p2.x, p3.x), y: cubicBezier(t, p0.y, p1.y, p2.y, p3.y) }
      const dx = point.x - target.x
      const dy = point.y - target.y
      const distSq = dx * dx + dy * dy
      if (distSq < best.distSq) best = { segmentIndex: s, t, point, distSq }
    }
  }
  return best
}

function straightHandles(a: Point, b: Point): [Point, Point] {
  return [
    { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + (b.x - a.x) * (2 / 3), y: a.y + (b.y - a.y) * (2 / 3) }
  ]
}

/** Chains a list of anchor points with straight-line handles between each consecutive pair — a 3k+1 path whose segments render as straight lines. */
function buildStraightChain(anchors: Point[]): Point[] {
  const out: Point[] = [anchors[0]]
  for (let i = 0; i < anchors.length - 1; i++) {
    const [h1, h2] = straightHandles(anchors[i], anchors[i + 1])
    out.push(h1, h2, anchors[i + 1])
  }
  return out
}

function numAnchors(path: Point[]): number {
  return (path.length - 1) / 3 + 1
}

function chordDist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** De Casteljau split of one cubic bezier segment at parameter `t`, returning both halves as independent 4-point control sequences (each a valid segment on its own). */
function splitBezierSegment(
  seg: [Point, Point, Point, Point],
  t: number
): { left: [Point, Point, Point, Point]; right: [Point, Point, Point, Point] } {
  const [p0, p1, p2, p3] = seg
  const lerp = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const p01 = lerp(p0, p1)
  const p12 = lerp(p1, p2)
  const p23 = lerp(p2, p3)
  const p012 = lerp(p01, p12)
  const p123 = lerp(p12, p23)
  const m = lerp(p012, p123)
  return { left: [p0, p01, p012, m], right: [m, p123, p23, p3] }
}

/**
 * Trims a small window out of the two bezier segments flanking the anchor at
 * raw index `idx` (a multiple of 3), sized so each trim point sits roughly
 * `windowDistance` from the anchor along its own segment's chord. Returns the
 * KEPT (unmodified-shape) outer portion of each segment plus the two trim
 * points — the curve everywhere outside this small window is left untouched,
 * only the corner itself gets replaced by the caller.
 */
function localCornerWindow(
  path: Point[],
  idx: number,
  windowDistance: number
): { incomingKept: [Point, Point, Point, Point]; outgoingKept: [Point, Point, Point, Point]; m1: Point; m2: Point } {
  const inSeg: [Point, Point, Point, Point] = [path[idx - 3], path[idx - 2], path[idx - 1], path[idx]]
  const outSeg: [Point, Point, Point, Point] = [path[idx], path[idx + 1], path[idx + 2], path[idx + 3]]
  const inChord = chordDist(inSeg[0], inSeg[3]) || 1e-6
  const outChord = chordDist(outSeg[0], outSeg[3]) || 1e-6
  const tIn = 1 - Math.min(Math.max(windowDistance / inChord, 0.02), 0.9)
  const tOut = Math.min(Math.max(windowDistance / outChord, 0.02), 0.9)
  const inSplit = splitBezierSegment(inSeg, tIn)
  const outSplit = splitBezierSegment(outSeg, tOut)
  return { incomingKept: inSplit.left, outgoingKept: outSplit.right, m1: inSplit.left[3], m2: outSplit.right[0] }
}

/** Splices a fillet/chamfer's kept segments + local straight-chain bridge back into the full path, replacing only the corner window at anchor `idx`. */
function spliceCornerReplacement(
  path: Point[],
  idx: number,
  incomingKept: [Point, Point, Point, Point],
  outgoingKept: [Point, Point, Point, Point],
  middleAnchors: Point[]
): Point[] {
  const chain = buildStraightChain(middleAnchors)
  return [
    ...path.slice(0, idx - 3),
    ...incomingKept,
    ...chain.slice(1),
    ...outgoingKept.slice(1),
    ...path.slice(idx + 3 + 1)
  ]
}

/**
 * Rounds the corner at the interior anchor `anchorIndex` (0-based among
 * anchors, not the raw 3k+1 array index) with a tangent arc of `radius`.
 * Only a small local window around that anchor is touched — each flanking
 * bezier segment is split near the corner (`localCornerWindow`) so the bulk
 * of the original curve's shape (its bow/camber) is preserved exactly; just
 * the trimmed tips get bridged by a short straight-segment arc approximation
 * (same convention as the CrossSectionEditor's fillet). No-op at endpoints or
 * on an already-straight corner (fillet has nothing to round).
 */
export function filletAnchor(path: Point[], anchorIndex: number, radius: number, arcSteps = 6): Point[] {
  const n = numAnchors(path)
  if (anchorIndex <= 0 || anchorIndex >= n - 1) return path
  const idx = anchorIndex * 3
  const anchor = path[idx]
  const { incomingKept, outgoingKept, m1, m2 } = localCornerWindow(path, idx, radius * 3)
  const arced = filletVertex([m1, anchor, m2], 1, radius, arcSteps)
  if (arced.length === 3) return path
  return spliceCornerReplacement(path, idx, incomingKept, outgoingKept, arced)
}

/** Same as `filletAnchor` but a straight chamfer cut instead of an arc. */
export function chamferAnchor(path: Point[], anchorIndex: number, distance: number): Point[] {
  const n = numAnchors(path)
  if (anchorIndex <= 0 || anchorIndex >= n - 1) return path
  const idx = anchorIndex * 3
  const anchor = path[idx]
  const { incomingKept, outgoingKept, m1, m2 } = localCornerWindow(path, idx, distance * 3)
  const cut = chamferVertex([m1, anchor, m2], 1, distance)
  if (cut.length === 3) return path
  return spliceCornerReplacement(path, idx, incomingKept, outgoingKept, cut)
}

/**
 * Pushes the interior anchor at `anchorIndex` further from its neighbors'
 * midpoint by `distance`, translating its two owned handles by the same
 * delta so their tangent direction/length is preserved (same effect as
 * dragging the anchor with the mouse, but by an exact numeric amount).
 */
export function extendAnchor(path: Point[], anchorIndex: number, distance: number): Point[] {
  const n = numAnchors(path)
  if (anchorIndex <= 0 || anchorIndex >= n - 1) return path
  const idx = anchorIndex * 3
  const prevAnchor = path[idx - 3]
  const anchor = path[idx]
  const nextAnchor = path[idx + 3]
  const moved = extendVertex([prevAnchor, anchor, nextAnchor], 1, distance)[1]
  const delta = { x: moved.x - anchor.x, y: moved.y - anchor.y }
  const next = path.map((p) => ({ ...p }))
  next[idx] = moved
  next[idx - 1] = { x: path[idx - 1].x + delta.x, y: path[idx - 1].y + delta.y }
  next[idx + 1] = { x: path[idx + 1].x + delta.x, y: path[idx + 1].y + delta.y }
  return next
}

/**
 * Half-width of the board's outline at `x`, on the given side (`side >= 0` ->
 * right rail / `board.outline`; `side < 0` -> left rail, which is `outline`
 * itself when the board is symmetric, or the independently-edited
 * `outlineOpposite` when asymmetric). Centralizes a lookup that used to be
 * duplicated in meshGenerator/exportSTL/exportGcode/exportDXF/ThreeDView/
 * FinPlacementMap.
 */
export function railHalfWidthAt(board: BoardState, x: number, side: number): number {
  const path = side < 0 && !board.outlineSymmetric ? (board.outlineOpposite ?? board.outline) : board.outline
  return resampleOnX(evaluatePath(path, 150), [x])[0]
}
