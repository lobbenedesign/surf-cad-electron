// Watertight 3D Fin Box (Scassa) mesh generator and STL exporter for 3D printing.
// Generates a rectangular socket box with a hollow central pocket matching standard fin tab specs
// (FCS I, FCS II, Futures, US Box, Lokbox) with a solid 3mm wall thickness.

import { FIN_BOX_SPECS } from './finGeometry'

interface Vec3 {
  x: number
  y: number
  z: number
}

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

export function exportBoxToStl(boxType: string): string {
  // Retrieve box specifications
  const spec = FIN_BOX_SPECS[boxType] || { tabLength: 9.0, tabWidth: 0.8, tabDepth: 1.9, label: 'Custom Box' }
  
  const tL = spec.tabLength
  const tW = spec.tabWidth
  const tD = spec.tabDepth

  // Wall thickness: 3mm (0.3cm)
  const wall = 0.3

  const oL = tL + 2 * wall
  const oW = tW + 2 * wall
  const oD = tD + wall // Bottom wall thickness

  const vertices: Vec3[] = [
    // Outer Bottom Face (z = -oD) [0..3]
    { x: -oL / 2, y: -oW / 2, z: -oD }, // 0
    { x: oL / 2, y: -oW / 2, z: -oD },  // 1
    { x: oL / 2, y: oW / 2, z: -oD },   // 2
    { x: -oL / 2, y: oW / 2, z: -oD },  // 3

    // Outer Top Rim (z = 0) [4..7]
    { x: -oL / 2, y: -oW / 2, z: 0 },   // 4
    { x: oL / 2, y: -oW / 2, z: 0 },    // 5
    { x: oL / 2, y: oW / 2, z: 0 },     // 6
    { x: -oL / 2, y: oW / 2, z: 0 },    // 7

    // Inner Cavity Bottom (z = -tD) [8..11]
    { x: -tL / 2, y: -tW / 2, z: -tD }, // 8
    { x: tL / 2, y: -tW / 2, z: -tD },  // 9
    { x: tL / 2, y: tW / 2, z: -tD },   // 10
    { x: -tL / 2, y: tW / 2, z: -tD },  // 11

    // Inner Cavity Top Rim (z = 0) [12..15]
    { x: -tL / 2, y: -tW / 2, z: 0 },   // 12
    { x: tL / 2, y: -tW / 2, z: 0 },    // 13
    { x: tL / 2, y: tW / 2, z: 0 },     // 14
    { x: -tL / 2, y: tW / 2, z: 0 }     // 15
  ]

  const triangles: [number, number, number][] = [
    // 1. Outer Bottom (facing -z)
    [0, 2, 1], [0, 3, 2],

    // 2. Outer Sides
    // Front (yMin)
    [0, 1, 5], [0, 5, 4],
    // Right (xMax)
    [1, 2, 6], [1, 6, 5],
    // Back (yMax)
    [2, 3, 7], [2, 7, 6],
    // Left (xMin)
    [3, 0, 4], [3, 4, 7],

    // 3. Top Rim (facing +z)
    // Front
    [4, 5, 13], [4, 13, 12],
    // Right
    [5, 6, 14], [5, 14, 13],
    // Back
    [6, 7, 15], [6, 15, 14],
    // Left
    [7, 4, 12], [7, 12, 15],

    // 4. Inner Cavity Walls (facing inwards)
    // Front
    [12, 9, 13], [12, 8, 9],
    // Right
    [13, 10, 14], [13, 9, 10],
    // Back
    [14, 11, 15], [14, 10, 11],
    // Left
    [15, 8, 12], [15, 11, 8],

    // 5. Inner Cavity Bottom (facing +z)
    [8, 9, 10], [8, 10, 11]
  ]

  const out: string[] = []
  out.push(`solid box_${boxType}`)

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

  out.push(`endsolid box_${boxType}`)
  return out.join('\n')
}
