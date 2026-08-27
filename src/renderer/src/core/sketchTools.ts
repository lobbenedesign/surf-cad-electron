// Classic 2D CAD sketch operations (fillet/chamfer/trim/extend) applied to a
// polyline of control points, e.g. a CrossSectionEditor half-profile. Operates
// on one interior vertex at a time, identified by index.

import type { Point } from './bezier'

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}
function norm(v: Point): Point {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}
function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}
function scale(v: Point, s: number): Point {
  return { x: v.x * s, y: v.y * s }
}

/**
 * Rounds the corner at `points[index]` with a tangent circular arc of the given
 * radius, replacing the vertex with `arcSteps` points sampled along the arc.
 * Radius is clamped so the tangent points never cross the adjacent vertices.
 * Returns the unmodified points if `index` is an endpoint (no two neighbors).
 */
export function filletVertex(points: Point[], index: number, radius: number, arcSteps = 6): Point[] {
  if (index <= 0 || index >= points.length - 1) return points
  const p = points[index]
  const a = points[index - 1]
  const b = points[index + 1]
  const dA = norm(sub(a, p))
  const dB = norm(sub(b, p))
  const theta = Math.acos(Math.max(-1, Math.min(1, dA.x * dB.x + dA.y * dB.y)))
  if (theta < 1e-3 || theta > Math.PI - 1e-3) return points

  const maxDist = Math.min(Math.hypot(a.x - p.x, a.y - p.y), Math.hypot(b.x - p.x, b.y - p.y)) * 0.95
  const tangentDist = Math.min(radius / Math.tan(theta / 2), maxDist)
  const clampedRadius = tangentDist * Math.tan(theta / 2)

  const t1 = add(p, scale(dA, tangentDist))
  const t2 = add(p, scale(dB, tangentDist))

  const bisector = norm(add(dA, dB))
  const centerDist = clampedRadius / Math.sin(theta / 2)
  const center = add(p, scale(bisector, centerDist))

  const a1 = Math.atan2(t1.y - center.y, t1.x - center.x)
  const a2 = Math.atan2(t2.y - center.y, t2.x - center.x)
  let delta = a2 - a1
  if (delta > Math.PI) delta -= 2 * Math.PI
  if (delta < -Math.PI) delta += 2 * Math.PI

  const arc: Point[] = []
  for (let i = 0; i <= arcSteps; i++) {
    const t = a1 + (delta * i) / arcSteps
    arc.push({ x: center.x + clampedRadius * Math.cos(t), y: center.y + clampedRadius * Math.sin(t) })
  }

  return [...points.slice(0, index), ...arc, ...points.slice(index + 1)]
}

/**
 * Cuts the corner at `points[index]` with a straight chamfer segment, replacing
 * the vertex with two points offset toward each neighbor by `distance`.
 */
export function chamferVertex(points: Point[], index: number, distance: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return points
  const p = points[index]
  const a = points[index - 1]
  const b = points[index + 1]
  const dA = norm(sub(a, p))
  const dB = norm(sub(b, p))
  const maxDist = Math.min(Math.hypot(a.x - p.x, a.y - p.y), Math.hypot(b.x - p.x, b.y - p.y)) * 0.95
  const d = Math.min(distance, maxDist)

  const t1 = add(p, scale(dA, d))
  const t2 = add(p, scale(dB, d))

  return [...points.slice(0, index), t1, t2, ...points.slice(index + 1)]
}

/** Removes an interior vertex, reconnecting its neighbors directly (trim). */
export function trimVertex(points: Point[], index: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return points
  if (points.length <= 3) return points
  return points.filter((_, i) => i !== index)
}

/**
 * Extends the vertex at `index` outward along the direction away from its
 * midpoint-to-neighbors, by `distance`. Used to stretch an interior point
 * further from the profile (the CrossSectionEditor pins true endpoints to the
 * centerline, so this targets interior points, typically the rail-edge apex).
 */
export function extendVertex(points: Point[], index: number, distance: number): Point[] {
  if (index <= 0 || index >= points.length - 1) return points
  const p = points[index]
  const a = points[index - 1]
  const b = points[index + 1]
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const dir = norm(sub(p, mid))
  const moved = add(p, scale(dir, distance))
  return [...points.slice(0, index), moved, ...points.slice(index + 1)]
}
