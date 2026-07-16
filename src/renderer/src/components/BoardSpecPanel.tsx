import { useState } from 'react'
import { computeStationMeasurements, estimateVolumeLiters, estimatePlanAreaM2 } from '../core/measurements'
import type { MeasureMode } from '../core/measurements'
import type { BoardState } from '../core/types'

interface BoardSpecPanelProps {
  board: BoardState
}

export function BoardSpecPanel({ board }: BoardSpecPanelProps): React.JSX.Element {
  const [mode, setMode] = useState<MeasureMode>('straight')
  const rows = computeStationMeasurements(board, mode)
  const volumeL = estimateVolumeLiters(board)
  const areaM2 = estimatePlanAreaM2(board)

  return (
    <div className="spec-panel">
      <div className="spec-mode-toggle">
        <button className={mode === 'straight' ? 'active' : ''} onClick={() => setMode('straight')}>
          Linea retta
        </button>
        <button className={mode === 'stringer' ? 'active' : ''} onClick={() => setMode('stringer')}>
          Lungo stringer
        </button>
      </div>
      <table className="spec-table">
        <thead>
          <tr>
            <th>Stazione</th>
            <th>Larghezza</th>
            <th>Spessore</th>
            <th>Rocker</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.width.toFixed(1)} cm</td>
              <td>{r.thickness.toFixed(1)} cm</td>
              <td>{r.rocker.toFixed(1)} cm</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="spec-volume">
        Volume stimato: <strong>{volumeL.toFixed(2)} L</strong> · Area piano: <strong>{areaM2.toFixed(2)} m²</strong>
      </div>
    </div>
  )
}
