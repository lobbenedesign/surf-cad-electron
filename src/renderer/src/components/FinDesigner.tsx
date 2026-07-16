import { FinOutlineEditor } from './FinOutlineEditor'
import { FinPreview3D } from './FinPreview3D'
import { FIN_TEMPLATES, findTemplate } from '../core/finTypes'
import { FIN_BOX_SPECS } from '../core/finGeometry'
import type { FinInstance, FoilType, TipType, FinBoxType } from '../core/finTypes'
import type { FinOutline } from '../core/finTypes'

interface FinDesignerProps {
  fin: FinInstance
  onChange: (fin: FinInstance) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const FOIL_LABELS: Record<FoilType, string> = {
  flat: 'Flat (keel / center)',
  '50/50': '50/50 simmetrico (center/twin)',
  '80/20': '80/20 asimmetrico (thruster/quad)',
  inverted: 'Inverted 20/80'
}

const TIP_LABELS: Record<TipType, string> = {
  round: 'Round',
  squared: 'Squared',
  narrow: 'Narrow',
  pointed: 'Pointed'
}

function finArea(outline: FinOutline): number {
  // shoelace formula over the outline + implicit base closing edge
  const pts = [...outline, outline[0]]
  let sum = 0
  for (let i = 0; i < pts.length - 1; i++) {
    sum += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y
  }
  return Math.abs(sum) / 2
}

export function FinDesigner({ fin, onChange, onDragStart, onDragEnd }: FinDesignerProps): React.JSX.Element {
  const applyTemplate = (templateId: string): void => {
    const t = findTemplate(templateId)
    onChange({
      ...fin,
      templateId: t.id,
      outline: t.outline.map((p) => ({ ...p })),
      height: t.height,
      base: t.base,
      foil: t.foil,
      tip: t.tip
    })
  }

  const area = finArea(fin.outline)
  const spec = FIN_BOX_SPECS[fin.box]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr', height: '100%', minHeight: 0 }}>
      <div style={{ borderRight: '1px solid var(--border)', padding: 14, overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Template</h3>
        <select
          value={fin.templateId}
          onChange={(e) => applyTemplate(e.target.value)}
          style={{ width: '100%', marginBottom: 16 }}
        >
          {FIN_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        <div className="dims-field">
          <label>Depth (cm)</label>
          <input
            type="number"
            value={fin.height}
            onChange={(e) => onChange({ ...fin, height: Number(e.target.value) })}
            onFocus={onDragStart}
            onBlur={onDragEnd}
          />
        </div>
        <div className="dims-field">
          <label>Base (cm)</label>
          <input
            type="number"
            value={fin.base}
            onChange={(e) => onChange({ ...fin, base: Number(e.target.value) })}
            onFocus={onDragStart}
            onBlur={onDragEnd}
          />
        </div>
        <div className="dims-field">
          <label>Area</label>
          <span>{area.toFixed(1)} cm²</span>
        </div>

        <h3>Foil</h3>
        <select value={fin.foil} onChange={(e) => onChange({ ...fin, foil: e.target.value as FoilType })} style={{ width: '100%' }}>
          {(Object.keys(FOIL_LABELS) as FoilType[]).map((f) => (
            <option key={f} value={f}>
              {FOIL_LABELS[f]}
            </option>
          ))}
        </select>

        <h3>Tip</h3>
        <select value={fin.tip} onChange={(e) => onChange({ ...fin, tip: e.target.value as TipType })} style={{ width: '100%' }}>
          {(Object.keys(TIP_LABELS) as TipType[]).map((t) => (
            <option key={t} value={t}>
              {TIP_LABELS[t]}
            </option>
          ))}
        </select>

        <h3>Attacco</h3>
        <select value={fin.box} onChange={(e) => onChange({ ...fin, box: e.target.value as FinBoxType })} style={{ width: '100%' }}>
          {(Object.keys(FIN_BOX_SPECS) as FinBoxType[]).map((b) => (
            <option key={b} value={b}>
              {FIN_BOX_SPECS[b].label}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
          Tab {spec.tabLength > 0 ? `${spec.tabLength.toFixed(1)}×${spec.tabWidth.toFixed(1)}×${spec.tabDepth.toFixed(1)} cm` : 'nessuna (glass-on)'}
        </p>

        <h3>Installazione</h3>
        <div className="dims-field">
          <label>Cant (°)</label>
          <input
            type="number"
            value={fin.cant}
            onChange={(e) => onChange({ ...fin, cant: Number(e.target.value) })}
            onFocus={onDragStart}
            onBlur={onDragEnd}
          />
        </div>
        <div className="dims-field">
          <label>Toe (°)</label>
          <input
            type="number"
            value={fin.toe}
            onChange={(e) => onChange({ ...fin, toe: Number(e.target.value) })}
            onFocus={onDragStart}
            onBlur={onDragEnd}
          />
        </div>
      </div>

      <div style={{ borderRight: '1px solid var(--border)', position: 'relative' }}>
        <div className="quad-cell-label">Template pinna</div>
        <div style={{ height: 'calc(100% - 24px)' }}>
          <FinOutlineEditor
            outline={fin.outline}
            height={fin.height}
            base={fin.base}
            onChange={(outline) => onChange({ ...fin, outline })}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div className="quad-cell-label">Anteprima 3D</div>
        <div style={{ height: 'calc(100% - 24px)' }}>
          <FinPreview3D fin={fin} />
        </div>
      </div>
    </div>
  )
}
