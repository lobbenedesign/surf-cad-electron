import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHT_INPUTS, estimateBoardWeight } from './weightCalculator'
import type { WeightInputs } from './weightCalculator'

describe('estimateBoardWeight', () => {
  it('computes foam mass as density x volume for PU vs EPS', () => {
    const base: WeightInputs = {
      volumeLiters: 1000, // 1 m^3, for round numbers
      planAreaM2: 0,
      foam: 'PU',
      glassWeightOzYd2: 0,
      glassLayers: 0,
      hardwareKg: 0
    }
    // PU density is defined as 40 kg/m^3.
    expect(estimateBoardWeight(base).foamKg).toBeCloseTo(40, 6)
    // EPS density is defined as 28 kg/m^3.
    expect(estimateBoardWeight({ ...base, foam: 'EPS' }).foamKg).toBeCloseTo(28, 6)
  })

  it('scales foam mass linearly with volume', () => {
    const inputs: WeightInputs = {
      volumeLiters: 45,
      planAreaM2: 0,
      foam: 'PU',
      glassWeightOzYd2: 0,
      glassLayers: 0,
      hardwareKg: 0
    }
    const doubled = estimateBoardWeight({ ...inputs, volumeLiters: 90 })
    const single = estimateBoardWeight(inputs)
    expect(doubled.foamKg).toBeCloseTo(single.foamKg * 2, 6)
  })

  it('computes glass mass from areal weight, plan area, rail-wrap and resin ratio', () => {
    const inputs: WeightInputs = {
      volumeLiters: 0,
      planAreaM2: 1,
      foam: 'PU',
      glassWeightOzYd2: 4,
      glassLayers: 1,
      hardwareKg: 0
    }
    // glassGM2 = 4 * 33.906 = 135.624 g/m^2
    // wettedAreaM2 = 1 * 1.15
    // dryGlassKg = 135.624 * 1.15 / 1000
    // glassKg = dryGlassKg * 2.5
    const expectedDry = (4 * 33.906 * 1.15) / 1000
    const expectedGlass = expectedDry * 2.5
    expect(estimateBoardWeight(inputs).glassKg).toBeCloseTo(expectedGlass, 6)
  })

  it('scales glass mass linearly with the number of layers', () => {
    const inputs: WeightInputs = {
      volumeLiters: 0,
      planAreaM2: 1,
      foam: 'PU',
      glassWeightOzYd2: 6,
      glassLayers: 2,
      hardwareKg: 0
    }
    const oneLayer = estimateBoardWeight({ ...inputs, glassLayers: 1 })
    const threeLayers = estimateBoardWeight({ ...inputs, glassLayers: 3 })
    expect(threeLayers.glassKg).toBeCloseTo(oneLayer.glassKg * 3, 6)
  })

  it('adds hardware mass unchanged and sums to the total', () => {
    const inputs: WeightInputs = {
      volumeLiters: 20,
      planAreaM2: 0.5,
      foam: 'EPS',
      glassWeightOzYd2: 4,
      glassLayers: 3,
      hardwareKg: 0.3
    }
    const result = estimateBoardWeight(inputs)
    expect(result.hardwareKg).toBe(0.3)
    expect(result.totalKg).toBeCloseTo(result.foamKg + result.glassKg + result.hardwareKg, 10)
  })

  it('ships sane defaults', () => {
    expect(DEFAULT_WEIGHT_INPUTS.foam).toBe('PU')
    expect(DEFAULT_WEIGHT_INPUTS.glassLayers).toBeGreaterThan(0)
    expect(DEFAULT_WEIGHT_INPUTS.hardwareKg).toBeGreaterThanOrEqual(0)
  })
})
