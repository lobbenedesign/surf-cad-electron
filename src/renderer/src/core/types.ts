import type { Point } from './bezier'
import { defaultCrossSections, type CrossSectionStation } from './crossSection'
import { defaultFinSetup, type FinSetup } from './finTypes'
import { defaultBoardDesign, type BoardDesign } from './design'
import type { ReferenceImage } from './referenceImage'
import type { DeckStep } from './deckStep'

/** 4 control points of a cubic bezier curve (p0, p1, p2, p3). */
export type CurveCP = [Point, Point, Point, Point]

/**
 * A chained multi-segment cubic-bezier path: length is always 3k+1 for k
 * segments. Anchors (on-curve points) sit at indices 0, 3, 6...; the two
 * points between consecutive anchors are that segment's handles. A plain
 * `CurveCP` is a valid 1-segment `OutlinePath` with no conversion needed.
 * See core/outlinePath.ts for split/remove/append helpers.
 */
export type OutlinePath = Point[]

export type TailType = 'round' | 'square' | 'pin' | 'squash' | 'swallow'

export interface TailShape {
  type: TailType
  /** How deep the swallow notch cuts inward from the tail tip, in cm. */
  swallowDepth: number
  /** Full width between the two swallow tips, in cm. */
  tipToTipWidth: number
}

export interface BoardState {
  name: string
  length: number
  width: number
  thickness: number
  /** Half-width profile (right rail when asymmetric), top view: x = 0..length (nose->tail), y = half width. Variable-length path — see OutlinePath. */
  outline: OutlinePath
  /** True (default) mirrors `outline` for the left rail. False lets the left rail be shaped independently via `outlineOpposite`. */
  outlineSymmetric: boolean
  /** Only used when `outlineSymmetric` is false: the independently-edited left rail (also nose->tail, y = half width magnitude on that side). */
  outlineOpposite?: OutlinePath
  /** Bottom elevation profile, side view: x = 0..length, y = elevation (rocker). */
  rocker: CurveCP
  /** Deck elevation profile, side view: x = 0..length, y = elevation. */
  deck: CurveCP
  /** Optional deck-height step (extra tail lift/release) — see core/deckStep.ts. Undefined = no step (default, matches all existing boards). */
  deckStep?: DeckStep
  /** Rail cross-section profiles at 9 stations from nose (0) to tail (1). */
  crossSections: CrossSectionStation[]
  tailShape: TailShape
  finSetup: FinSetup
  design: BoardDesign
  /** Trace-image references, one per 2D curve view — see core/referenceImage.ts. */
  referenceImages: { outline?: ReferenceImage; rocker?: ReferenceImage }
}

export function defaultBoard(): BoardState {
  return {
    name: 'Nuova Tavola',
    length: 200,
    width: 50,
    thickness: 6,
    outline: [
      { x: 0, y: 0 },
      { x: 50, y: 15 },
      { x: 150, y: 25 },
      { x: 200, y: 0 }
    ],
    rocker: [
      { x: 0, y: 10 },
      { x: 50, y: 2 },
      { x: 150, y: 1 },
      { x: 200, y: 4 }
    ],
    deck: [
      { x: 0, y: 10.5 },
      { x: 50, y: 8 },
      { x: 150, y: 7 },
      { x: 200, y: 4.2 }
    ],
    outlineSymmetric: true,
    crossSections: defaultCrossSections(),
    tailShape: { type: 'round', swallowDepth: 5, tipToTipWidth: 10 },
    finSetup: defaultFinSetup('thruster'),
    design: defaultBoardDesign(),
    referenceImages: {}
  }
}
