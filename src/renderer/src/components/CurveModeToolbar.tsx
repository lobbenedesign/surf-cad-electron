interface CurveModeToolbarProps {
  mode: 'edit' | 'digitize' | 'measure' | 'draw'
  onModeChange: (mode: 'edit' | 'digitize' | 'measure' | 'draw') => void
  digitizedCount: number
  onApplyFit: () => void
  onClearDigitized: () => void
  /** Shows the "🖊 Disegna" mode button — only meaningful where the curve supports variable point count (allowPathEditing on CurveEditor2D). */
  showDrawMode?: boolean
  /** Shows a Simmetrico/Asimmetrico toggle button, right-aligned. */
  symmetricToggle?: { symmetric: boolean; onToggle: () => void }
}

export function CurveModeToolbar({
  mode,
  onModeChange,
  digitizedCount,
  onApplyFit,
  onClearDigitized,
  showDrawMode = false,
  symmetricToggle
}: CurveModeToolbarProps): React.JSX.Element {
  return (
    <div className="ref-image-bar">
      <div className="mode-toggle-group">
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => onModeChange('edit')}>
          ✏️ Edit
        </button>
        <button className={mode === 'digitize' ? 'active' : ''} onClick={() => onModeChange('digitize')}>
          📍 Digitalizza
        </button>
        <button className={mode === 'measure' ? 'active' : ''} onClick={() => onModeChange('measure')}>
          📏 Misura
        </button>
        {showDrawMode && (
          <button className={mode === 'draw' ? 'active' : ''} onClick={() => onModeChange('draw')}>
            🖊 Disegna
          </button>
        )}
      </div>
      {mode === 'digitize' && (
        <>
          <span style={{ color: 'var(--text-dim)' }}>{digitizedCount} punti tracciati</span>
          <button onClick={onApplyFit} disabled={digitizedCount < 2}>
            ✓ Applica fit
          </button>
          <button onClick={onClearDigitized} disabled={digitizedCount === 0}>
            ✕ Cancella punti
          </button>
        </>
      )}
      {mode === 'measure' && <span style={{ color: 'var(--text-dim)' }}>Clicca due punti per misurare distanza e angolo</span>}
      {mode === 'draw' && (
        <span style={{ color: 'var(--text-dim)' }}>
          Clicca per estendere la curva · doppio click sulla curva per inserire un punto · seleziona un punto e premi Canc per eliminarlo
        </span>
      )}
      {symmetricToggle && (
        <button onClick={symmetricToggle.onToggle} style={{ marginLeft: 'auto' }}>
          {symmetricToggle.symmetric ? '🪞 Simmetrico' : '🔀 Asimmetrico'}
        </button>
      )}
    </div>
  )
}
