import { useState, useMemo } from 'react'
import { computeStationMeasurements } from '../core/measurements'
import type { MeasureMode } from '../core/measurements'
import type { BoardState } from '../core/types'
import { computeHydrodynamics } from '../core/hydrodynamics'

interface BoardSpecPanelProps {
  board: BoardState
  ghostBoard?: BoardState | null
}

export function BoardSpecPanel({ board, ghostBoard = null }: BoardSpecPanelProps): React.JSX.Element {
  const [mode, setMode] = useState<MeasureMode>('straight')
  const rows = computeStationMeasurements(board, mode)
  const ghostRows = ghostBoard ? computeStationMeasurements(ghostBoard, mode) : null

  // Highly accurate numerical hydrodynamics
  const hydro = useMemo(() => computeHydrodynamics(board), [board])
  const ghostHydro = useMemo(() => (ghostBoard ? computeHydrodynamics(ghostBoard) : null), [ghostBoard])

  // Conversion helpers: cm^2 to dm^2 and sq ft
  const toDm2 = (cm2: number) => cm2 / 100
  const toSqFt = (cm2: number) => cm2 / 929.03

  // SVG Chart path calculation
  const svgPath = useMemo(() => {
    if (hydro.distributionCurve.length === 0) return ''
    const width = 280
    const height = 60
    const maxArea = Math.max(...hydro.distributionCurve.map((d) => d.area), 1)
    const points = hydro.distributionCurve.map((d) => {
      const px = (d.x / board.length) * width
      const py = height - (d.area / maxArea) * height
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    // Closed path for filled look
    return `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`
  }, [hydro, board.length])

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
            {ghostRows && <th>Δ Largh. ghost</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.width.toFixed(1)} cm</td>
              <td>{r.thickness.toFixed(1)} cm</td>
              <td>{r.rocker.toFixed(1)} cm</td>
              {ghostRows && (
                <td className={r.width - ghostRows[i].width >= 0 ? 'delta-pos' : 'delta-neg'}>
                  {r.width - ghostRows[i].width >= 0 ? '+' : ''}
                  {(r.width - ghostRows[i].width).toFixed(1)} cm
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--text-dim)' }}>🌊 Parametri Idrodinamici</h4>
        <div className="spec-volume" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
          <div>
            Volume Reale: <strong>{hydro.volumeLiters.toFixed(2)} L</strong>
          </div>
          <div>
            Area Piano: <strong>{toDm2(hydro.planformAreaSqCm).toFixed(1)} dm²</strong> ({toSqFt(hydro.planformAreaSqCm).toFixed(2)} ft²)
          </div>
          <div>
            Sup. Bagnata (WSA): <strong>{toDm2(hydro.wettedSurfaceAreaSqCm).toFixed(1)} dm²</strong>
          </div>
          <div>
            Centro Spinta (LCB): <strong>{hydro.lcbFromTailCm.toFixed(1)} cm</strong> ({hydro.lcbPercent}%) <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>da coda</span>
          </div>
        </div>
      </div>

      {ghostHydro && (
        <div className="spec-volume" style={{ fontSize: 11, background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4, marginTop: 8 }}>
          👻 <strong>Ghost Delta:</strong> Volume {hydro.volumeLiters - ghostHydro.volumeLiters >= 0 ? '+' : ''}{(hydro.volumeLiters - ghostHydro.volumeLiters).toFixed(2)} L · WSA {hydro.wettedSurfaceAreaSqCm - ghostHydro.wettedSurfaceAreaSqCm >= 0 ? '+' : ''}{(toDm2(hydro.wettedSurfaceAreaSqCm - ghostHydro.wettedSurfaceAreaSqCm)).toFixed(1)} dm²
        </div>
      )}

      {svgPath && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>Naso (0%)</span>
            <span>Distribuzione Sezione Area / Volume</span>
            <span>Coda (100%)</span>
          </div>
          <svg width="100%" height="60" viewBox="0 0 280 60" preserveAspectRatio="none" style={{ background: '#1c1c1e', border: '1px solid var(--border)', borderRadius: 4, display: 'block' }}>
            <path d={svgPath} fill="rgba(88,166,255,0.18)" stroke="#58a6ff" strokeWidth={1.5} />
            {/* LCB Marker */}
            {hydro.lcbPercent > 0 && (
              <line 
                x1={`${((100 - hydro.lcbPercent) / 100) * 280}`} 
                y1="0" 
                x2={`${((100 - hydro.lcbPercent) / 100) * 280}`} 
                y2="60" 
                stroke="#ff9f0a" 
                strokeWidth={1} 
                strokeDasharray="2,2"
              />
            )}
          </svg>
        </div>
      )}
    </div>
  )
}
