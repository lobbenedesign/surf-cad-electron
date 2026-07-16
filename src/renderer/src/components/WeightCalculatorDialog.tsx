import { useState } from 'react'
import { estimateVolumeLiters, estimatePlanAreaM2 } from '../core/measurements'
import { estimateBoardWeight, DEFAULT_WEIGHT_INPUTS } from '../core/weightCalculator'
import type { FoamType } from '../core/weightCalculator'
import type { BoardState } from '../core/types'

interface WeightCalculatorDialogProps {
  board: BoardState
  onClose: () => void
}

const FOAM_LABELS: Record<FoamType, string> = {
  PU: 'PU (poliuretano, ~40 kg/m³)',
  EPS: 'EPS (polistirene, ~28 kg/m³)'
}

export function WeightCalculatorDialog({ board, onClose }: WeightCalculatorDialogProps): React.JSX.Element {
  const [foam, setFoam] = useState<FoamType>(DEFAULT_WEIGHT_INPUTS.foam)
  const [glassWeightOzYd2, setGlassWeightOzYd2] = useState(DEFAULT_WEIGHT_INPUTS.glassWeightOzYd2)
  const [glassLayers, setGlassLayers] = useState(DEFAULT_WEIGHT_INPUTS.glassLayers)
  const [hardwareKg, setHardwareKg] = useState(DEFAULT_WEIGHT_INPUTS.hardwareKg)

  const volumeLiters = estimateVolumeLiters(board)
  const planAreaM2 = estimatePlanAreaM2(board)
  const estimate = estimateBoardWeight({ volumeLiters, planAreaM2, foam, glassWeightOzYd2, glassLayers, hardwareKg })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚖️ Weight Calculator</h3>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -8 }}>
          Stima per preventivo, non una bilancia di precisione. Volume {volumeLiters.toFixed(2)}L · Area piano{' '}
          {planAreaM2.toFixed(2)}m².
        </p>

        <div className="dims-field">
          <label>Foam</label>
          <select value={foam} onChange={(e) => setFoam(e.target.value as FoamType)}>
            {(Object.keys(FOAM_LABELS) as FoamType[]).map((f) => (
              <option key={f} value={f}>
                {FOAM_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div className="dims-field">
          <label>Glass (oz/yd² per strato)</label>
          <input type="number" value={glassWeightOzYd2} onChange={(e) => setGlassWeightOzYd2(Number(e.target.value))} />
        </div>
        <div className="dims-field">
          <label>Strati glass (deck+bottom)</label>
          <input type="number" value={glassLayers} onChange={(e) => setGlassLayers(Number(e.target.value))} />
        </div>
        <div className="dims-field">
          <label>Hardware (kg)</label>
          <input type="number" step={0.05} value={hardwareKg} onChange={(e) => setHardwareKg(Number(e.target.value))} />
        </div>

        <div className="weight-breakdown">
          <div>
            <span>Foam</span>
            <span>{estimate.foamKg.toFixed(2)} kg</span>
          </div>
          <div>
            <span>Glass + resina</span>
            <span>{estimate.glassKg.toFixed(2)} kg</span>
          </div>
          <div>
            <span>Hardware</span>
            <span>{estimate.hardwareKg.toFixed(2)} kg</span>
          </div>
          <div className="weight-total">
            <span>Totale stimato</span>
            <span>{estimate.totalKg.toFixed(2)} kg</span>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}
