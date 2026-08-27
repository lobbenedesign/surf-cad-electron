import type { Point } from './bezier'

/** Foil cross-section family (fin span thickness/lift profile). */
export type FoilType = 'flat' | '50/50' | '80/20' | 'inverted'

/** Tip shape family, affects curvature near the tip control points. */
export type TipType = 'round' | 'squared' | 'narrow' | 'pointed'

/** Base attachment / box system — determines the base-tab geometry. */
export type FinBoxType = 'FCS1' | 'FCS2' | 'Futures' | 'USBox' | 'Lokbox' | 'GlassOn'

/**
 * Outline control points, base-front (leading edge @ box) -> tip -> base-back
 * (trailing edge @ box), in local fin space: x = span-wise from leading base
 * point, y = height above the base line. The base line itself (P_last -> P0)
 * is implicit (straight, sits in the box slot).
 */
export type FinOutline = Point[]

export interface FinTemplate {
  id: string
  label: string
  category: 'thruster' | 'twin' | 'quad-front' | 'quad-rear' | 'keel' | 'longboard' | 'center'
  height: number // cm, base to tip
  base: number // cm, leading to trailing edge at the box line
  foil: FoilType
  tip: TipType
  outline: FinOutline
}

export interface FinInstance {
  templateId: string
  outline: FinOutline
  height: number
  base: number
  foil: FoilType
  tip: TipType
  box: FinBoxType
  /** Lateral tilt of the fin off vertical, degrees (0 = perpendicular to bottom). */
  cant: number
  /** Toe-in angle relative to the stringer, degrees (0 = parallel to stringer). */
  toe: number
}

export type FinSetupType = 'single' | 'twin' | 'thruster' | 'quad' | '2+1' | 'none'

export interface FinSlot {
  id: string
  label: string
  /** Distance forward of the tail tip, cm. */
  distFromTail: number
  /**
   * Distance in from the rail edge at this station, cm — not an absolute lateral
   * coordinate, since the rail's actual half-width varies by board and by station.
   * Sign selects the side (negative = left/port, positive = right/starboard);
   * 0 = on the stringer (centered, used by single/center fins). The renderer
   * resolves this to a world Y position from the board's actual outline width
   * at this fin's station, so a fin never floats outside the rail.
   */
  railInset: number
  fin: FinInstance
}

export interface FinSetup {
  type: FinSetupType
  slots: FinSlot[]
}

/** Builds a fin outline from base parameters, sampled the same way the rest of the app samples curves. */
export function buildOutlineFromParams(height: number, base: number, rakeFraction: number, tipTuck: number): FinOutline {
  const rake = height * rakeFraction
  return [
    { x: 0, y: 0 },
    { x: rake * 0.35, y: height * 0.42 },
    { x: rake, y: height },
    { x: rake + base * tipTuck, y: height * 0.94 },
    { x: base * 0.72, y: height * 0.3 },
    { x: base, y: 0 }
  ]
}

const T = (
  id: string,
  label: string,
  category: FinTemplate['category'],
  height: number,
  base: number,
  rakeFraction: number,
  foil: FoilType,
  tip: TipType,
  tipTuck = 0.12
): FinTemplate => ({
  id,
  label,
  category,
  height,
  base,
  foil,
  tip,
  outline: buildOutlineFromParams(height, base, rakeFraction, tipTuck)
})

export interface FinBoxDimension {
  length: number
  width: number
  depth: number
}

export const FIN_BOX_DIMENSIONS: Record<FinBoxType, FinBoxDimension> = {
  FCS1: { length: 8.5, width: 1.6, depth: 1.5 },
  FCS2: { length: 10.4, width: 1.8, depth: 1.6 },
  Futures: { length: 14.2, width: 1.9, depth: 1.9 },
  USBox: { length: 26.8, width: 2.4, depth: 2.6 },
  Lokbox: { length: 9.8, width: 1.9, depth: 1.6 },
  GlassOn: { length: 0, width: 0, depth: 0 }
}

/** Templates loosely modeled on common commercial fin families (see roadmap.md §2.4 / fin research). */
export const FIN_TEMPLATES: FinTemplate[] = [
  T('T1', 'T1 — Thruster Standard', 'thruster', 11.6, 11.3, 0.42, '80/20', 'round'),
  T('T2', 'T2 — Thruster Upright', 'thruster', 11.2, 11.0, 0.25, '80/20', 'squared'),
  T('T3', 'T3 — Thruster Big Flyer', 'thruster', 12.4, 12.0, 0.58, '80/20', 'narrow'),
  T('T4', 'T4 — Thruster All-Round', 'thruster', 11.8, 11.4, 0.38, '80/20', 'round'),
  T('T5', 'T5 — Thruster Small Wave', 'thruster', 10.6, 10.4, 0.3, '80/20', 'round'),
  T('T6', 'T6 — Thruster Grovel', 'thruster', 9.8, 10.0, 0.22, '80/20', 'squared'),
  T('Q1', 'Q1 — Quad Rear', 'quad-rear', 9.6, 9.0, 0.24, 'flat', 'round'),
  T('K1', 'K1 — Keel', 'keel', 13.2, 15.5, 0.5, 'flat', 'round', 0.22),
  T('L1', 'L1 — Longboard Pivot 8"', 'longboard', 20.3, 15.2, 0.28, '50/50', 'round'),
  T('L2', 'L2 — Longboard Flex 8"', 'longboard', 20.3, 14.5, 0.46, '50/50', 'narrow'),
  T('TW1', 'TW1 — Twin Keel-ish', 'twin', 13.0, 14.0, 0.44, 'flat', 'round'),
  T('FCS_CARVER', 'FCS II Carver (Sweep/Rake-heavy)', 'thruster', 11.6, 11.3, 0.45, '80/20', 'round'),
  T('FCS_PERFORMER', 'FCS II Performer (Balanced)', 'thruster', 11.5, 11.1, 0.35, '80/20', 'round'),
  T('FUTURES_F6', 'Futures F6 (Medium Template)', 'thruster', 11.4, 11.2, 0.38, 'flat', 'round'),
  T('USBOX_PIVOT', 'US Box Pivot 9.0 (Longboard)', 'longboard', 22.8, 16.5, 0.18, '50/50', 'round')
]

export function findTemplate(id: string): FinTemplate {
  return FIN_TEMPLATES.find((t) => t.id === id) ?? FIN_TEMPLATES[0]
}

function instanceFromTemplate(t: FinTemplate, box: FinBoxType, cant: number, toe: number): FinInstance {
  return {
    templateId: t.id,
    outline: t.outline.map((p) => ({ ...p })),
    height: t.height,
    base: t.base,
    foil: t.foil,
    tip: t.tip,
    box,
    cant,
    toe
  }
}

/**
 * Cant/toe defaults per setup, echoing the real-world values already used in
 * SURF PY_2/templates.py. Side fins always come in mirrored pairs: same
 * |railInset| and |cant|/|toe|, opposite sign. Cant's sign is chosen so the
 * fin leans outward (tip further from centerline than the base) — verified
 * numerically, not just by eye: with this rig's rotation order (flip, then
 * cant about the local X/chord axis, then toe about the local Z/span axis),
 * a positive cant on the fin's own near side plus this rig's fixed 180°
 * flip actually pulls the tip inward, so the outward-leaning sign is negative
 * on the left (negative-railInset) fin and positive on the right. Side fins
 * also sit forward of the trailing center fin (larger distFromTail), matching
 * a standard thruster/quad silhouette (rear fin closest to the tail).
 */
export function defaultFinSetup(type: FinSetupType): FinSetup {
  const mk = (id: string, label: string, distFromTail: number, railInset: number, templateId: string, cant: number, toe: number): FinSlot => ({
    id,
    label,
    distFromTail,
    railInset,
    fin: instanceFromTemplate(findTemplate(templateId), 'FCS2', cant, toe)
  })

  switch (type) {
    case 'single':
      return { type, slots: [mk('center', 'Center', 8, 0, 'L1', 0, 0)] }
    case 'twin':
      return {
        type,
        slots: [
          mk('left', 'Left', 12, -2.5, 'TW1', -4, 1),
          mk('right', 'Right', 12, 2.5, 'TW1', 4, -1)
        ]
      }
    case 'thruster':
      return {
        type,
        slots: [
          mk('left', 'Left', 16, -2.2, 'T1', -6, 3),
          mk('right', 'Right', 16, 2.2, 'T1', 6, -3),
          mk('center', 'Center', 9, 0, 'T4', 0, 0)
        ]
      }
    case 'quad':
      return {
        type,
        slots: [
          mk('left-front', 'Left front', 16, -2.2, 'T1', -6, 3),
          mk('right-front', 'Right front', 16, 2.2, 'T1', 6, -3),
          mk('left-rear', 'Left rear', 8, -1.8, 'Q1', -4, 1),
          mk('right-rear', 'Right rear', 8, 1.8, 'Q1', 4, -1)
        ]
      }
    case '2+1':
      return {
        type,
        slots: [
          mk('left', 'Left', 14, -2.2, 'T2', -6, 3),
          mk('right', 'Right', 14, 2.2, 'T2', 6, -3),
          mk('center', 'Center', 10, 0, 'L1', 0, 0)
        ]
      }
    case 'none':
    default:
      return { type: 'none', slots: [] }
  }
}

/** Mirror partner slot id for a symmetric pair (left <-> right, left-front <-> right-front, ...), or null (single/center fins). */
export function mirrorIdOf(id: string): string | null {
  if (id.startsWith('left')) return 'right' + id.slice(4)
  if (id.startsWith('right')) return 'left' + id.slice(5)
  return null
}

/**
 * Applies a position/orientation edit to one slot, propagating it to its mirror
 * partner (if any): distance-from-tail is shared as-is, rail inset/cant/toe
 * mirror as negation (opposite side). Used by both the setup panel's numeric
 * fields and the 2D placement map's drag handles, so a paired side fin only
 * ever needs to be moved once.
 */
export function updateFinPosition(
  setup: FinSetup,
  slotId: string,
  patch: { distFromTail?: number; railInset?: number; cant?: number; toe?: number }
): FinSetup {
  const mirrorId = mirrorIdOf(slotId)
  const apply = (s: FinSlot, mirrored: boolean): FinSlot => {
    const sign = mirrored ? -1 : 1
    return {
      ...s,
      distFromTail: patch.distFromTail ?? s.distFromTail,
      railInset: patch.railInset !== undefined ? sign * patch.railInset : s.railInset,
      fin: {
        ...s.fin,
        cant: patch.cant !== undefined ? sign * patch.cant : s.fin.cant,
        toe: patch.toe !== undefined ? sign * patch.toe : s.fin.toe
      }
    }
  }
  return {
    ...setup,
    slots: setup.slots.map((s) => {
      if (s.id === slotId) return apply(s, false)
      if (mirrorId && s.id === mirrorId) return apply(s, true)
      return s
    })
  }
}

/** World-space (mount-relative) position of a fin slot: x = distance from nose, y = signed lateral offset from stringer, resolved from the board's actual half-width at that station. */
export function finSlotMountPosition(slot: FinSlot, length: number, halfWidthAtX: (x: number) => number, minLateralGap = 0.5): Point {
  const mountX = length - slot.distFromTail
  const side = Math.sign(slot.railInset)
  const y = side === 0 ? 0 : side * Math.max(halfWidthAtX(mountX) - Math.abs(slot.railInset), minLateralGap)
  return { x: mountX, y }
}
