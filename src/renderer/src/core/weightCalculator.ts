// Board weight estimate. Not a precision scale — a shaping-stage budgeting aid,
// same ambition level as the formula found in the OpenShaper research (roadmap.md
// §1.6): foam density x volume, plus fiberglass areal weight x wetted area x a
// rail-wrap factor x a resin-to-glass ratio, plus a flat hardware allowance
// (fin plugs/leash plug/stringer offcuts).

export type FoamType = 'PU' | 'EPS'

const FOAM_DENSITY_KG_M3: Record<FoamType, number> = { PU: 40, EPS: 28 }

/** How much more surface than the flat plan area gets glassed, from wrapping both rails. */
const RAIL_WRAP_FACTOR = 1.15
/** Cured glass+resin mass per unit of dry cloth mass, typical hand-layup ratio. */
const RESIN_TO_GLASS_RATIO = 2.5
/** oz/yd² -> g/m². */
const OZ_YD2_TO_G_M2 = 33.906

export interface WeightInputs {
  volumeLiters: number
  planAreaM2: number
  foam: FoamType
  /** Fiberglass areal weight per layer, oz/yd² (e.g. 4 or 6). */
  glassWeightOzYd2: number
  /** Number of glass layers, deck + bottom combined (e.g. 2 deck + 1 bottom = 3). */
  glassLayers: number
  /** Fin plugs, leash plug, stringer, etc., kg. */
  hardwareKg: number
}

export interface WeightEstimate {
  foamKg: number
  glassKg: number
  hardwareKg: number
  totalKg: number
}

export function estimateBoardWeight(inputs: WeightInputs): WeightEstimate {
  const { volumeLiters, planAreaM2, foam, glassWeightOzYd2, glassLayers, hardwareKg } = inputs

  const foamKg = (volumeLiters / 1000) * FOAM_DENSITY_KG_M3[foam]

  const glassGM2 = glassWeightOzYd2 * OZ_YD2_TO_G_M2
  const wettedAreaM2 = planAreaM2 * RAIL_WRAP_FACTOR
  const dryGlassKg = (glassGM2 * wettedAreaM2 * glassLayers) / 1000
  const glassKg = dryGlassKg * RESIN_TO_GLASS_RATIO

  return {
    foamKg,
    glassKg,
    hardwareKg,
    totalKg: foamKg + glassKg + hardwareKg
  }
}

export const DEFAULT_WEIGHT_INPUTS: Omit<WeightInputs, 'volumeLiters' | 'planAreaM2'> = {
  foam: 'PU',
  glassWeightOzYd2: 4,
  glassLayers: 3,
  hardwareKg: 0.25
}
