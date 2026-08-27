// Lofts outline (half-width) + rocker (bottom elevation) + deck (top elevation)
// curves, combined with per-station rail cross-section profiles, into a
// structured grid of 3D points, then triangulates into a THREE.BufferGeometry.
// Coordinate mapping: x = length axis, y = width, z = up.

import * as THREE from 'three'
import { evaluateCurve, evaluatePath, resampleOnX } from './bezier'
import { buildFullRailLoop, interpolateStationPoints } from './crossSection'
import { deckStepOffsetAt } from './deckStep'
import type { BoardState, CurveCP } from './types'

const N_SLICES = 90
const HALF_SAMPLES = 16
const N_POINTS_PER_SLICE = HALF_SAMPLES * 2

export function generateBoardGeometry(board: BoardState): THREE.BufferGeometry {
  const { outline, outlineOpposite, outlineSymmetric, rocker, deck, deckStep, length, crossSections, tailShape } = board

  const outlineCurve = evaluatePath(outline, 100)
  const rockerCurve = evaluateCurve(...(rocker as CurveCP), 100)
  const deckCurve = evaluateCurve(...(deck as CurveCP), 100)

  const commonX = Array.from({ length: N_SLICES }, (_, i) => (i / (N_SLICES - 1)) * length)

  const rockerZ = resampleOnX(rockerCurve, commonX)
  const deckZ = resampleOnX(deckCurve, commonX).map((z, i) => z + deckStepOffsetAt(deckStep, commonX[i], length))

  // Right-rail width per station, with the square/swallow tail special-case
  // (both assume a single symmetric rail shape, so they only apply there —
  // an asymmetric board's tail shape instead comes directly from each side's
  // own drawn curve, same as 'round'/'pin'/'squash' already do).
  const outlineYRight = resampleOnX(outlineCurve, commonX)
  const squareLen = Math.min(8, length * 0.05)
  const squareX0 = length - squareLen
  const squareWidth = resampleOnX(outlineCurve, [squareX0])[0]
  const swallowRegion = Math.max(tailShape.swallowDepth * 1.4, 6)
  const swallowX0 = Math.max(length - swallowRegion, length * 0.5)
  const tipHalf = tailShape.tipToTipWidth / 2
  const tailTipWidth = resampleOnX(outlineCurve, [length])[0]

  let outlineYLeft = outlineYRight
  if (!outlineSymmetric) {
    const outlineCurveLeft = evaluatePath(outlineOpposite ?? outline, 100)
    outlineYLeft = resampleOnX(outlineCurveLeft, commonX)
  }

  const positions: number[] = []
  const uvs: number[] = []
  // Per-slice, per-column v (0=bottom-center..1=deck-center) recorded alongside
  // positions so face classification below can tell deck from bottom without
  // re-deriving it from final XYZ (a v>=0.5 flat threshold breaks down once
  // centerOffset/tail-shape skew the X/Y positions of the swallow notch).
  const vGrid: number[][] = []

  for (let i = 0; i < N_SLICES; i++) {
    const cx = commonX[i]
    const cz = rockerZ[i]
    let wRight = outlineYRight[i]
    if (wRight < 0.1) wRight = 0.1
    let wLeft = outlineYLeft[i]
    if (wLeft < 0.1) wLeft = 0.1
    const h = Math.max(deckZ[i] - rockerZ[i], 0.1)

    let centerOffset = 0
    if (outlineSymmetric) {
      if (tailShape.type === 'square' && cx >= squareX0) {
        wRight = squareWidth
        wLeft = squareWidth
      }
      if (tailShape.type === 'swallow' && cx >= swallowX0) {
        const f = (cx - swallowX0) / Math.max(length - swallowX0, 0.001)
        centerOffset = f * Math.max(tipHalf - tailTipWidth, 0)
      }
    }

    const t = cx / length
    const halfPts = interpolateStationPoints(crossSections, t)
    const loop = buildFullRailLoop(halfPts, HALF_SAMPLES)

    const vRow: number[] = []
    for (let j = 0; j < loop.length; j++) {
      const u = loop[j].x
      const v = loop[j].y
      const isRightHalf = j < HALF_SAMPLES
      const w = isRightHalf ? wRight : wLeft
      const offset = centerOffset === 0 ? 0 : isRightHalf ? centerOffset : -centerOffset
      positions.push(cx, u * w + offset, cz + v * h)
      // UV: x = length position (0..1 nose->tail), y = lateral position across the
      // full mirrored width — matches the board-plan cm space `renderDesignCanvas`
      // paints into (design.ts/ThreeDView.tsx), where increasing board Y (u) moves
      // DOWN the source canvas (larger pixel row). THREE.CanvasTexture defaults to
      // flipY=true, which samples v=1 from the canvas's *top* row and v=0 from its
      // *bottom* row — the opposite direction — so this must invert u, not just
      // rescale it, or the design ends up mirrored left/right on the hull.
      uvs.push(t, (1 - u) / 2)
      vRow.push(v)
    }
    vGrid.push(vRow)
  }

  // Deck (top) and bottom faces need separate material groups so each can carry
  // its own design texture (§6) — split by the cross-section v-coordinate (>=0.5
  // is the deck half of the rail loop, see crossSection.ts) rather than by station
  // index, since deck/bottom vertices are interleaved within every ring.
  const deckIndices: number[] = []
  const bottomIndices: number[] = []
  for (let i = 0; i < N_SLICES - 1; i++) {
    for (let j = 0; j < N_POINTS_PER_SLICE - 1; j++) {
      const a = i * N_POINTS_PER_SLICE + j
      const b = a + 1
      const c = a + N_POINTS_PER_SLICE
      const d = c + 1
      const avgV = (vGrid[i][j] + vGrid[i][j + 1] + vGrid[i + 1][j] + vGrid[i + 1][j + 1]) / 4
      const target = avgV >= 0.5 ? deckIndices : bottomIndices
      target.push(a, c, b, b, c, d)
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
    uvs.push(sliceIndex === 0 ? 0 : 1, 0.5)
    const vRow = vGrid[sliceIndex]
    for (let j = 0; j < N_POINTS_PER_SLICE; j++) {
      const a = base + j
      const jn = (j + 1) % N_POINTS_PER_SLICE
      const b = base + jn
      const avgV = (vRow[j] + vRow[jn]) / 2
      const target = avgV >= 0.5 ? deckIndices : bottomIndices
      target.push(...(flip ? [centerIdx, b, a] : [centerIdx, a, b]))
    }
  }
  capRing(0, true)
  capRing(N_SLICES - 1, false)

  // Concatenated into one index buffer with two contiguous ranges so
  // `geometry.addGroup` can assign each range its own material (deck vs bottom
  // design texture) — `THREE.Mesh` accepts a material array indexed by group.
  const indices = [...deckIndices, ...bottomIndices]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.addGroup(0, deckIndices.length, 0)
  geometry.addGroup(deckIndices.length, bottomIndices.length, 1)
  geometry.computeVertexNormals()
  return geometry
}
