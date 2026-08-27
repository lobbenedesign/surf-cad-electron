// Watertight 3D Fin mesh generator and STL exporter for 3D printing.
// Combines a closed, manifold blade tube with a solid base tab block,
// resulting in a 3D-printable model compatible with standard slicers (Cura, PrusaSlicer).

import type { FinInstance } from './finTypes'
import { FIN_BOX_SPECS } from './finGeometry'
import { catmullRomSample } from './spline'
import { interp } from './bezier'

interface Vec3 {
  x: number
  y: number
  z: number
}

// Compute normal of a triangle using cross product
function computeNormal(v1: Vec3, v2: Vec3, v3: Vec3): Vec3 {
  const ax = v2.x - v1.x
  const ay = v2.y - v1.y
  const az = v2.z - v1.z
  const bx = v3.x - v1.x
  const by = v3.y - v1.y
  const bz = v3.z - v1.z
  
  const nx = ay * bz - az * by
  const ny = az * bx - ax * bz
  const nz = ax * by - ay * bx
  
  const len = Math.hypot(nx, ny, nz) || 1
  return { x: nx / len, y: ny / len, z: nz / len }
}

function foilProfile(c: number): number {
  const cc = Math.max(0, Math.min(1, c))
  return 0.2969 * Math.sqrt(cc) - 0.126 * cc - 0.3516 * cc * cc + 0.2843 * cc ** 3 - 0.1015 * cc ** 4
}

function foilSplit(foil: string, c: number): [number, number] {
  const t = Math.max(foilProfile(c), 0)
  switch (foil) {
    case 'flat':
      return [t * 0.18, -t * 0.18]
    case '50/50':
      return [t, -t]
    case '80/20':
      return [t * 0.2, -t * 0.8]
    case 'inverted':
      return [t * 0.8, -t * 0.2]
    default:
      return [t, -t]
  }
}

export function exportFinToStl(fin: FinInstance): string {
  const N_SPAN = 30
  const N_CHORD = 16 // Number of points per half chord

  // 1. Interpolate outline curves
  const sampled = catmullRomSample(fin.outline, 200)
  let tipIdx = 0
  for (let i = 1; i < sampled.length; i++) {
    if (sampled[i].y > sampled[tipIdx].y) tipIdx = i
  }

  const leading = sampled.slice(0, tipIdx + 1)
  const trailing = sampled.slice(tipIdx)

  const leadingY = leading.map((p) => p.y)
  const leadingX = leading.map((p) => p.x)
  const trailingYDesc = trailing.map((p) => p.y)
  const trailingX = trailing.map((p) => p.x)
  const trailingYAsc = [...trailingYDesc].reverse()
  const trailingXAsc = [...trailingX].reverse()

  const maxThickness = Math.max(fin.base * 0.045, 0.35)
  const vertices: Vec3[] = []
  const triangles: [number, number, number][] = []

  // 2. Generate closed chord ring at each span level
  // Number of points in the closed ring: M = 2 * N_CHORD - 2
  const M = 2 * N_CHORD - 2

  for (let i = 0; i < N_SPAN; i++) {
    const z = (i / (N_SPAN - 1)) * fin.height
    const xLead = interp(z, leadingY, leadingX)
    const xTrail = interp(z, trailingYAsc, trailingXAsc)
    const chordLen = Math.max(xTrail - xLead, 0.01)
    const spanTaper = 1 - (z / fin.height) * 0.82 // thickness tapers at tip

    // Construct circular profile: leading edge -> positive y -> trailing edge -> negative y -> leading edge
    const ring: Vec3[] = []
    
    // Positive side (chord fraction goes 0 to 1)
    for (let j = 0; j < N_CHORD; j++) {
      const c = j / (N_CHORD - 1)
      const x = xLead + c * chordLen
      const [zp] = foilSplit(fin.foil, c)
      const y = zp * maxThickness * spanTaper
      ring.push({ x, y, z })
    }

    // Negative side (chord fraction goes from 1 back down to 0, skipping start and end indices to prevent duplicate vertices)
    for (let j = N_CHORD - 2; j > 0; j--) {
      const c = j / (N_CHORD - 1)
      const x = xLead + c * chordLen
      const [, zn] = foilSplit(fin.foil, c)
      const y = zn * maxThickness * spanTaper
      ring.push({ x, y, z })
    }

    vertices.push(...ring)
  }

  // 3. Connect rings with triangles (watertight side walls)
  for (let i = 0; i < N_SPAN - 1; i++) {
    const r1 = i * M
    const r2 = (i + 1) * M
    for (let k = 0; k < M; k++) {
      const kNext = (k + 1) % M
      
      const a = r1 + k
      const b = r1 + kNext
      const c = r2 + k
      const d = r2 + kNext

      // Triangle 1: a -> c -> b
      triangles.push([a, c, b])
      // Triangle 2: b -> c -> d
      triangles.push([b, c, d])
    }
  }

  // 4. Cap bottom at z = 0 (Base Cap)
  const baseCenterIdx = vertices.length
  let bx = 0, by = 0
  for (let k = 0; k < M; k++) {
    bx += vertices[k].x
    by += vertices[k].y
  }
  vertices.push({ x: bx / M, y: by / M, z: 0 }) // Base centroid

  for (let k = 0; k < M; k++) {
    const kNext = (k + 1) % M
    // Facing outward: bottom normal points towards -z, so clockwise ordering
    triangles.push([kNext, k, baseCenterIdx])
  }

  // 5. Cap top at z = height (Tip Cap)
  const tipCenterIdx = vertices.length
  let tx = 0, ty = 0
  const topOffset = (N_SPAN - 1) * M
  for (let k = 0; k < M; k++) {
    tx += vertices[topOffset + k].x
    ty += vertices[topOffset + k].y
  }
  vertices.push({ x: tx / M, y: ty / M, z: fin.height }) // Tip centroid

  for (let k = 0; k < M; k++) {
    const kNext = (k + 1) % M
    // Facing outward: top normal points towards +z, so counter-clockwise ordering
    triangles.push([topOffset + k, topOffset + kNext, tipCenterIdx])
  }

  // 6. Generate solid base tab box if applicable
  const spec = FIN_BOX_SPECS[fin.box]
  if (spec && spec.tabLength > 0) {
    const tabLength = Math.min(spec.tabLength, fin.base * 0.95)
    const tabWidth = spec.tabWidth
    const tabDepth = spec.tabDepth

    const xMin = (fin.base - tabLength) / 2
    const xMax = (fin.base + tabLength) / 2
    const yMin = -tabWidth / 2
    const yMax = tabWidth / 2
    const zMin = -tabDepth
    const zMax = 0

    // Box vertices (8 vertices)
    const boxOffset = vertices.length
    vertices.push(
      { x: xMin, y: yMin, z: zMin }, // 0
      { x: xMax, y: yMin, z: zMin }, // 1
      { x: xMax, y: yMax, z: zMin }, // 2
      { x: xMin, y: yMax, z: zMin }, // 3
      { x: xMin, y: yMin, z: zMax }, // 4
      { x: xMax, y: yMin, z: zMax }, // 5
      { x: xMax, y: yMax, z: zMax }, // 6
      { x: xMin, y: yMax, z: zMax }  // 7
    )

    // Box triangles (12 triangles) - counter-clockwise ordering facing outwards
    const boxTris: [number, number, number][] = [
      // Bottom face (zMin)
      [0, 2, 1], [0, 3, 2],
      // Top face (zMax)
      [4, 5, 6], [4, 6, 7],
      // Front face (yMin)
      [0, 1, 5], [0, 5, 4],
      // Back face (yMax)
      [2, 3, 7], [2, 7, 6],
      // Left face (xMin)
      [3, 0, 4], [3, 4, 7],
      // Right face (xMax)
      [1, 2, 6], [1, 6, 5]
    ]

    for (const t of boxTris) {
      triangles.push([boxOffset + t[0], boxOffset + t[1], boxOffset + t[2]])
    }
  }

  // 7. Write to ASCII STL format
  const out: string[] = []
  out.push(`solid fin_${fin.templateId}`)

  for (const t of triangles) {
    const v1 = vertices[t[0]]
    const v2 = vertices[t[1]]
    const v3 = vertices[t[2]]
    const norm = computeNormal(v1, v2, v3)

    out.push(`  facet normal ${norm.x.toFixed(6)} ${norm.y.toFixed(6)} ${norm.z.toFixed(6)}`)
    out.push('    outer loop')
    out.push(`      vertex ${v1.x.toFixed(4)} ${v1.y.toFixed(4)} ${v1.z.toFixed(4)}`)
    out.push(`      vertex ${v2.x.toFixed(4)} ${v2.y.toFixed(4)} ${v2.z.toFixed(4)}`)
    out.push(`      vertex ${v3.x.toFixed(4)} ${v3.y.toFixed(4)} ${v3.z.toFixed(4)}`)
    out.push('    endloop')
    out.push('  endfacet')
  }

  out.push(`endsolid fin_${fin.templateId}`)
  return out.join('\n')
}
