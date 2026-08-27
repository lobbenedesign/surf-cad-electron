// Board shape presets. Real dimensions ported from `SURF PY_2/templates.py`
// (SURFBOARD_TEMPLATES dict). Source uses x=0 at the tail; this app's BoardState
// uses x=0 at the nose (see measurements.ts), so nose/tail fields are swapped here.

import type { BoardState, CurveCP, TailType } from './types'
import { defaultCrossSections } from './crossSection'
import { defaultFinSetup, type FinSetupType } from './finTypes'
import { defaultBoardDesign } from './design'

export interface BoardTemplate {
  id: string
  label: string
  description: string
  length: number
  maxWidth: number
  thickness: number
  noseRocker: number
  tailRocker: number
  /** Fraction of length where the board is widest, measured from the tail (source convention). */
  maxWidthPosFromTail: number
  noseWidth30: number
  tailWidth30: number
  tailType: TailType
  finSetup: FinSetupType
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'shortboard',
    label: 'Shortboard',
    description: 'High-performance shortboard. Agile and precise for vertical surfing.',
    length: 183.0,
    maxWidth: 48.5,
    thickness: 6.0,
    noseRocker: 13.5,
    tailRocker: 6.2,
    maxWidthPosFromTail: 0.58,
    noseWidth30: 31.0,
    tailWidth30: 35.5,
    tailType: 'squash',
    finSetup: 'thruster'
  },
  {
    id: 'fish',
    label: 'Fish',
    description: 'Retro Fish. Fast and loose in small to medium waves with great flotation.',
    length: 172.0,
    maxWidth: 53.5,
    thickness: 6.8,
    noseRocker: 8.5,
    tailRocker: 3.8,
    maxWidthPosFromTail: 0.48,
    noseWidth30: 41.5,
    tailWidth30: 43.5,
    tailType: 'swallow',
    finSetup: 'twin'
  },
  {
    id: 'longboard',
    label: 'Longboard',
    description: 'Classic Longboard. Maximum stability and glide for traditional style.',
    length: 275.0,
    maxWidth: 58.5,
    thickness: 7.6,
    noseRocker: 12.0,
    tailRocker: 8.5,
    maxWidthPosFromTail: 0.45,
    noseWidth30: 48.0,
    tailWidth30: 44.5,
    tailType: 'round',
    finSetup: 'single'
  },
  {
    id: 'gun',
    label: 'Gun',
    description: 'Big Wave Gun. Optimized for extreme speed and stability in heavy surf.',
    length: 236.0,
    maxWidth: 50.0,
    thickness: 7.2,
    noseRocker: 16.0,
    tailRocker: 7.5,
    maxWidthPosFromTail: 0.62,
    noseWidth30: 29.5,
    tailWidth30: 32.5,
    tailType: 'pin',
    finSetup: 'quad'
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    description: 'Versatile hybrid. Good balance between paddling power and maneuverability.',
    length: 198.0,
    maxWidth: 52.0,
    thickness: 6.5,
    noseRocker: 11.5,
    tailRocker: 5.2,
    maxWidthPosFromTail: 0.53,
    noseWidth30: 37.5,
    tailWidth30: 39.0,
    tailType: 'round',
    finSetup: 'thruster'
  }
]

/**
 * Scales the two interior control points of a cubic bezier (fixed endpoints e0/e3,
 * unscaled shape ratios r1/r2) so the curve's peak value hits `target`.
 * Bezier y(t) is linear in the interior control values for a fixed t, so this
 * converges in a couple of fixed-point iterations (the argmax t barely moves).
 */
function calibratedInterior(e0: number, e3: number, r1: number, r2: number, target: number): [number, number] {
  const samples = 300
  let k = 1
  let bestT = 0.5
  for (let iter = 0; iter < 3; iter++) {
    let maxY = -Infinity
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const mt = 1 - t
      const b0 = mt * mt * mt
      const b1 = 3 * mt * mt * t
      const b2 = 3 * mt * t * t
      const b3 = t * t * t
      const y = b0 * e0 + b1 * r1 * k + b2 * r2 * k + b3 * e3
      if (y > maxY) {
        maxY = y
        bestT = t
      }
    }
    const mt = 1 - bestT
    const b0 = mt * mt * mt
    const b1 = 3 * mt * mt * bestT
    const b2 = 3 * mt * bestT * bestT
    const b3 = bestT * bestT * bestT
    const variable = b1 * r1 + b2 * r2
    if (Math.abs(variable) > 1e-9) {
      k = (target - b0 * e0 - b3 * e3) / variable
    }
  }
  return [r1 * k, r2 * k]
}

export function buildBoardFromTemplate(template: BoardTemplate): BoardState {
  const { length, maxWidth, thickness, noseRocker, tailRocker, noseWidth30, tailWidth30 } = template

  const rocker: CurveCP = [
    { x: 0, y: noseRocker },
    { x: length * 0.2, y: noseRocker * 0.4 },
    { x: length * 0.8, y: tailRocker * 0.4 },
    { x: length, y: tailRocker }
  ]

  // Control points sit at the same nose/tail "30cm inset" stations BoardSpecPanel
  // measures (see measurements.ts): with the handle this close to each station,
  // calibratedInterior's peak-matched y-value also lands close to the real
  // nose_width_30/tail_width_30 spec there, instead of drifting off if the handle
  // were placed by max-width-position alone (which, for a nose/tail-heavy board
  // like a Gun, can leave the tail handle far from where "tail 30cm" actually is).
  const noseStationX = Math.min(30, length * 0.3)
  const tailStationX = Math.max(length - 30, length * 0.7)
  const [outlineY1, outlineY2] = calibratedInterior(0, 0, noseWidth30 / 2, tailWidth30 / 2, maxWidth / 2)
  const outline: CurveCP = [
    { x: 0, y: 0 },
    { x: noseStationX, y: outlineY1 },
    { x: tailStationX, y: outlineY2 },
    { x: length, y: 0 }
  ]

  const noseTipThickness = thickness / 12
  const tailTipThickness = thickness / 30
  const [deckHump1, deckHump2] = calibratedInterior(noseTipThickness, tailTipThickness, 1, 1, thickness)
  const deck: CurveCP = [
    { x: 0, y: rocker[0].y + noseTipThickness },
    { x: length * 0.2, y: rocker[1].y + deckHump1 },
    { x: length * 0.8, y: rocker[2].y + deckHump2 },
    { x: length, y: rocker[3].y + tailTipThickness }
  ]

  return {
    name: template.label,
    length,
    width: maxWidth,
    thickness,
    outline,
    outlineSymmetric: true,
    rocker,
    deck,
    crossSections: defaultCrossSections(),
    tailShape: { type: template.tailType, swallowDepth: 5, tipToTipWidth: 10 },
    finSetup: defaultFinSetup(template.finSetup),
    design: defaultBoardDesign(),
    referenceImages: {}
  }
}
