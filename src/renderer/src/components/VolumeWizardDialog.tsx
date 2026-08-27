import { useState } from 'react'
import { estimateVolumeLiters } from '../core/measurements'
import { solveForVolume } from '../core/volumeWizard'
import type { VolumeDimension } from '../core/volumeWizard'
import type { BoardState } from '../core/types'

interface VolumeWizardDialogProps {
  board: BoardState
  onApply: (board: BoardState) => void
  onClose: () => void
}

const DIM_LABELS: Record<VolumeDimension, string> = {
  length: 'Lunghezza',
  width: 'Larghezza',
  thickness: 'Spessore'
}

export function VolumeWizardDialog({ board, onApply, onClose }: VolumeWizardDialogProps): React.JSX.Element {
  const currentVolume = estimateVolumeLiters(board)
  const [targetVolume, setTargetVolume] = useState(Math.round(currentVolume * 10) / 10)
  const [dim, setDim] = useState<VolumeDimension>('width')

  const preview = solveForVolume(board, dim, targetVolume)
  const previewValue = dim === 'length' ? preview.length : dim === 'width' ? preview.width : preview.thickness
  const currentValue = dim === 'length' ? board.length : dim === 'width' ? board.width : board.thickness

  const handleApply = (): void => {
    onApply(preview)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🧮 Volume Wizard</h3>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -8 }}>
          Volume attuale: <strong>{currentVolume.toFixed(2)} L</strong>. Scegli quale dimensione modificare per
          raggiungere il volume target — le altre restano fisse, la forma delle curve resta proporzionalmente
          la stessa.
        </p>

        <div className="dims-field">
          <label>Volume target (L)</label>
          <input type="number" step={0.1} value={targetVolume} onChange={(e) => setTargetVolume(Number(e.target.value))} />
        </div>

        <div className="dims-field">
          <label>Dimensione da variare</label>
          <select value={dim} onChange={(e) => setDim(e.target.value as VolumeDimension)}>
            {(Object.keys(DIM_LABELS) as VolumeDimension[]).map((d) => (
              <option key={d} value={d}>
                {DIM_LABELS[d]}
              </option>
            ))}
          </select>
        </div>

        <div className="weight-breakdown">
          <div>
            <span>{DIM_LABELS[dim]} attuale</span>
            <span>{currentValue.toFixed(1)} cm</span>
          </div>
          <div className="weight-total">
            <span>{DIM_LABELS[dim]} risultante</span>
            <span>{previewValue.toFixed(1)} cm</span>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Annulla</button>
          <button className="primary" onClick={handleApply}>
            Applica
          </button>
        </div>
      </div>
    </div>
  )
}
