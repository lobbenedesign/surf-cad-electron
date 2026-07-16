import { useState } from 'react'
import type { TailShape, TailType } from '../core/types'

interface TailDesignerDialogProps {
  tailShape: TailShape
  boardWidth: number
  onApply: (tail: TailShape, outlineTailY: number) => void
  onClose: () => void
}

const TAIL_LABELS: Record<TailType, string> = {
  round: 'Round',
  square: 'Square',
  pin: 'Pin',
  squash: 'Squash',
  swallow: 'Swallow / Fish'
}

export function TailDesignerDialog({
  tailShape,
  boardWidth,
  onApply,
  onClose
}: TailDesignerDialogProps): React.JSX.Element {
  const [type, setType] = useState<TailType>(tailShape.type)
  const [swallowDepth, setSwallowDepth] = useState(tailShape.swallowDepth)
  const [tipToTipWidth, setTipToTipWidth] = useState(tailShape.tipToTipWidth)

  const handleApply = (): void => {
    const outlineTailY =
      {
        round: boardWidth * 0.06,
        pin: 0,
        squash: boardWidth * 0.18,
        square: boardWidth * 0.18,
        swallow: boardWidth * 0.05
      }[type] ?? 0

    onApply({ type, swallowDepth, tipToTipWidth }, outlineTailY)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🏄 Tail Designer</h3>

        <div className="dims-field">
          <label>Tipo di coda</label>
          <select value={type} onChange={(e) => setType(e.target.value as TailType)}>
            {(Object.keys(TAIL_LABELS) as TailType[]).map((t) => (
              <option key={t} value={t}>
                {TAIL_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {type === 'swallow' && (
          <>
            <div className="dims-field">
              <label>Profondità swallow (cm)</label>
              <input
                type="number"
                value={swallowDepth}
                onChange={(e) => setSwallowDepth(Number(e.target.value))}
              />
            </div>
            <div className="dims-field">
              <label>Larghezza tip-to-tip (cm)</label>
              <input
                type="number"
                value={tipToTipWidth}
                onChange={(e) => setTipToTipWidth(Number(e.target.value))}
              />
            </div>
          </>
        )}

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
