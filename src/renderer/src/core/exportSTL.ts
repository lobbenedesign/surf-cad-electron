// STL export of the lofted board solid (+ optional fins), in millimeters
// (board geometry is authored in cm; STL/CNC tooling conventionally expects mm).

import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { generateBoardGeometry } from './meshGenerator'
import { generateFinBladeGeometry, generateFinBoxGeometry } from './finGeometry'
import { evaluateCurve, evaluatePath, resampleOnX } from './bezier'
import type { BoardState, CurveCP } from './types'

/** Builds a single mesh (board + fins merged as siblings) scaled from cm to mm for export. */
function buildExportGroup(board: BoardState): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial()

  const boardMesh = new THREE.Mesh(generateBoardGeometry(board), material)
  group.add(boardMesh)

  const rockerCurve = evaluateCurve(...(board.rocker as CurveCP), 200)
  const outlineCurveRight = evaluatePath(board.outline, 200)
  const outlineCurveLeft = board.outlineSymmetric ? outlineCurveRight : evaluatePath(board.outlineOpposite ?? board.outline, 200)
  board.finSetup.slots.forEach((slot) => {
    const finGroup = new THREE.Group()
    finGroup.add(new THREE.Mesh(generateFinBladeGeometry(slot.fin), material))
    const boxGeom = generateFinBoxGeometry(slot.fin)
    if (boxGeom) finGroup.add(new THREE.Mesh(boxGeom, material))

    finGroup.rotation.x = Math.PI
    finGroup.rotateX(THREE.MathUtils.degToRad(slot.fin.cant))
    finGroup.rotateZ(THREE.MathUtils.degToRad(slot.fin.toe))

    const mountX = board.length - slot.distFromTail
    const outlineCurveForSide = slot.railInset < 0 ? outlineCurveLeft : outlineCurveRight
    const halfWidthAtStation = resampleOnX(outlineCurveForSide, [mountX])[0]
    const mountY = Math.sign(slot.railInset) * Math.max(halfWidthAtStation - Math.abs(slot.railInset), 0)
    const mountZ = resampleOnX(rockerCurve, [mountX])[0]
    finGroup.position.set(mountX, mountY, mountZ)

    group.add(finGroup)
  })

  group.scale.setScalar(10) // cm -> mm
  group.updateMatrixWorld(true)
  return group
}

/** Returns ASCII STL text for the current board (+ fins), in millimeters. */
export function exportBoardToStl(board: BoardState): string {
  const group = buildExportGroup(board)
  const exporter = new STLExporter()
  return exporter.parse(group, { binary: false })
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
