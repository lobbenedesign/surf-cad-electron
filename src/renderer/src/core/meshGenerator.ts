// Lofts outline (half-width) + rocker (bottom elevation) + deck (top elevation)
// curves, combined with per-station rail cross-section profiles, into a
// structured grid of 3D points, then triangulates into a THREE.BufferGeometry.
// Coordinate mapping: x = length axis, y = width, z = up.

import * as THREE from 'three'
import { evaluateCurve, resampleOnX } from './bezier'
import { buildFullRailLoop, interpolateStationPoints } from './crossSection'
import type { BoardState, CurveCP } from './types'

const N_SLICES = 90
const HALF_SAMPLES = 16
const N_POINTS_PER_SLICE = HALF_SAMPLES * 2

export function generateBoardGeometry(board: BoardState): THREE.BufferGeometry {
  const { outline, rocker, deck, length, crossSections, tailShape } = board

  const outlineCurve = evaluateCurve(...(outline as CurveCP), 100)
  const rockerCurve = evaluateCurve(...(rocker as CurveCP), 100)
  const deckCurve = evaluateCurve(...(deck as CurveCP), 100)

  const commonX = Array.from({ length: N_SLICES }, (_, i) => (i / (N_SLICES - 1)) * length)

  const outlineY = resampleOnX(outlineCurve, commonX)
  const rockerZ = resampleOnX(rockerCurve, commonX)
  const deckZ = resampleOnX(deckCurve, commonX)

  const squareLen = Math.min(8, length * 0.05)
  const squareX0 = length - squareLen
  const squareWidth = resampleOnX(outlineCurve, [squareX0])[0]

  const swallowRegion = Math.max(tailShape.swallowDepth * 1.4, 6)
  const swallowX0 = Math.max(length - swallowRegion, length * 0.5)
  const tipHalf = tailShape.tipToTipWidth / 2
  const tailTipWidth = resampleOnX(outlineCurve, [length])[0]

  const positions: number[] = []

  for (let i = 0; i < N_SLICES; i++) {
    const cx = commonX[i]
    const cz = rockerZ[i]
    let w = outlineY[i]
    if (w < 0.1) w = 0.1
    const h = Math.max(deckZ[i] - rockerZ[i], 0.1)

    if (tailShape.type === 'square' && cx >= squareX0) {
      w = squareWidth
    }

    let centerOffset = 0
    if (tailShape.type === 'swallow' && cx >= swallowX0) {
      const f = (cx - swallowX0) / Math.max(length - swallowX0, 0.001)
      centerOffset = f * Math.max(tipHalf - tailTipWidth, 0)
    }

    const t = cx / length
    const halfPts = interpolateStationPoints(crossSections, t)
    const loop = buildFullRailLoop(halfPts, HALF_SAMPLES)

    for (let j = 0; j < loop.length; j++) {
      const u = loop[j].x
      const v = loop[j].y
      const isRightHalf = j < HALF_SAMPLES
      const offset = centerOffset === 0 ? 0 : isRightHalf ? centerOffset : -centerOffset
      positions.push(cx, u * w + offset, cz + v * h)
    }
  }

  const indices: number[] = []
  for (let i = 0; i < N_SLICES - 1; i++) {
    for (let j = 0; j < N_POINTS_PER_SLICE - 1; j++) {
      const a = i * N_POINTS_PER_SLICE + j
      const b = a + 1
      const c = a + N_POINTS_PER_SLICE
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  // Fan-cap the nose and tail rings so the mesh is watertight (needed for STL/CAM
  // export, not just on-screen display — an open-ended loft isn't a valid solid).
  const capRing = (sliceIndex: number, flip: boolean): void => {
    const base = sliceIndex * N_POINTS_PER_SLICE
    let cx = 0
    let cy = 0
    let cz = 0
    for (let j = 0; j < N_POINTS_PER_SLICE; j++) {
      cx += positions[(base + j) * 3]
      cy += positions[(base + j) * 3 + 1]
      cz += positions[(base + j) * 3 + 2]
    }
    const centerIdx = positions.length / 3
    positions.push(cx / N_POINTS_PER_SLICE, cy / N_POINTS_PER_SLICE, cz / N_POINTS_PER_SLICE)
    for (let j = 0; j < N_POINTS_PER_SLICE; j++) {
      const a = base + j
      const b = base + ((j + 1) % N_POINTS_PER_SLICE)
      indices.push(...(flip ? [centerIdx, b, a] : [centerIdx, a, b]))
    }
  }
  capRing(0, true)
  capRing(N_SLICES - 1, false)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
