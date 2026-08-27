import { FIN_TEMPLATES, defaultFinSetup, findTemplate, updateFinPosition, FIN_BOX_DIMENSIONS } from '../core/finTypes'
import type { FinSetup, FinSetupType, FinSlot, FinBoxType } from '../core/finTypes'
import { exportFinToStl } from '../core/exportFinStl'
import { exportBoxToStl } from '../core/exportBoxStl'
import { downloadTextFile } from '../core/exportSTL'

interface FinSetupPanelProps {
  setup: FinSetup
  onChange: (setup: FinSetup) => void
  selectedSlotId: string | null
  onSelectSlot: (id: string | null) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

const SETUP_LABELS: Record<FinSetupType, string> = {
  none: 'Nessuna pinna',
  single: 'Single',
  twin: 'Twin',
  thruster: 'Thruster',
  quad: 'Quad',
  '2+1': '2+1'
}

export function FinSetupPanel({ setup, onChange, selectedSlotId, onSelectSlot, onDragStart, onDragEnd }: FinSetupPanelProps): React.JSX.Element {
  const setType = (type: FinSetupType): void => {
    const next = defaultFinSetup(type)
    onChange(next)
    onSelectSlot(next.slots[0]?.id ?? null)
  }

  const updateSlot = (id: string, patch: Partial<FinSlot>): void => {
    onChange({ ...setup, slots: setup.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  const quickAssignTemplate = (slot: FinSlot, templateId: string): void => {
    const t = findTemplate(templateId)
    updateSlot(slot.id, {
      fin: { ...slot.fin, templateId: t.id, outline: t.outline.map((p) => ({ ...p })), height: t.height, base: t.base, foil: t.foil, tip: t.tip }
    })
  }

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <h3 style={{ marginTop: 0 }}>Setup pinne</h3>
      <select value={setup.type} onChange={(e) => setType(e.target.value as FinSetupType)} style={{ width: '100%', marginBottom: 14 }}>
        {(Object.keys(SETUP_LABELS) as FinSetupType[]).map((t) => (
          <option key={t} value={t}>
            {SETUP_LABELS[t]}
          </option>
        ))}
      </select>

      {setup.slots.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Nessuna pinna in questo setup.</p>}

      {setup.slots.map((slot) => (
        <div
          key={slot.id}
          onClick={() => onSelectSlot(slot.id)}
          style={{
            padding: '10px 12px',
            marginBottom: 8,
            borderRadius: 6,
            cursor: 'pointer',
            border: '1px solid ' + (selectedSlotId === slot.id ? 'var(--accent)' : 'var(--border)'),
            background: selectedSlotId === slot.id ? 'var(--bg-panel)' : 'transparent'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            <span>{slot.label}</span>
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{slot.fin.templateId}</span>
          </div>
          <select
            value={slot.fin.templateId}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => quickAssignTemplate(slot, e.target.value)}
            style={{ width: '100%', marginBottom: 6, fontSize: 12 }}
          >
            {FIN_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <div style={{ marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
            <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>Scassa / Box</label>
            <select
              value={slot.fin.box}
              onChange={(e) => {
                updateSlot(slot.id, {
                  fin: { ...slot.fin, box: e.target.value as FinBoxType }
                })
              }}
              style={{ width: '100%', fontSize: 11, padding: '2px 4px' }}
            >
              <option value="FCS1">FCS I Plugs</option>
              <option value="FCS2">FCS II Keyless</option>
              <option value="Futures">Futures Single Tab</option>
              <option value="USBox">US Box (Longboard)</option>
              <option value="Lokbox">Lokbox</option>
              <option value="GlassOn">Glass-On (Fissa)</option>
            </select>
          </div>

          <PositionFields
            slot={slot}
            onChange={(patch) => onChange(updateFinPosition(setup, slot.id, patch))}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />

          {slot.fin.box !== 'GlassOn' && (
            <div style={{ marginTop: 10, fontSize: 9.5, background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)', padding: '6px 8px', borderRadius: 4, color: '#ff9f0a', lineHeight: '1.3em' }}>
              🛠️ <strong>Routing Scassa:</strong> L: {FIN_BOX_DIMENSIONS[slot.fin.box].length}cm · W: {FIN_BOX_DIMENSIONS[slot.fin.box].width}cm · D: {FIN_BOX_DIMENSIONS[slot.fin.box].depth}cm
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                const content = exportFinToStl(slot.fin)
                downloadTextFile(`pinna_${slot.fin.templateId.toLowerCase()}_${slot.fin.box.toLowerCase()}.stl`, content)
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4
              }}
            >
              ⬇️ Esporta Pinna (STL 3D)
            </button>
            {slot.fin.box !== 'GlassOn' && (
              <button
                onClick={() => {
                  const content = exportBoxToStl(slot.fin.box)
                  downloadTextFile(`scassa_${slot.fin.box.toLowerCase()}.stl`, content)
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: '#2c2c2e',
                  color: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4
                }}
              >
                ⬇️ Esporta Scassa (STL 3D)
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

interface PositionFieldsProps {
  slot: FinSlot
  onChange: (patch: { distFromTail?: number; railInset?: number; cant?: number; toe?: number }) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

/** Position/orientation editors for one fin slot. Side (paired) fins expose rail inset + cant/toe magnitude (mirrored automatically to the twin); a single/center fin is always centered on the stringer, so it only exposes distance-from-tail. */
function PositionFields({ slot, onChange, onDragStart, onDragEnd }: PositionFieldsProps): React.JSX.Element {
  const isCentered = slot.railInset === 0
  const fieldStyle: React.CSSProperties = { width: '100%', fontSize: 11, padding: '2px 4px' }
  const field = (
    label: string,
    value: number,
    onSet: (v: number) => void,
    step = 0.5
  ): React.JSX.Element => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: 'var(--text-dim)' }}>
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSet(Number(e.target.value))}
        onFocus={onDragStart}
        onBlur={onDragEnd}
        style={fieldStyle}
      />
    </label>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isCentered ? '1fr' : '1fr 1fr', gap: 6, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
      {field('Dist. coda (cm)', slot.distFromTail, (v) => onChange({ distFromTail: v }))}
      {isCentered ? (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', gridColumn: '1 / -1' }}>Centrata sullo stringer</div>
      ) : (
        <>
          {field('Inset dal rail (cm)', Math.abs(slot.railInset), (v) => onChange({ railInset: v }))}
          {/* Side (sign of railInset) is the authoritative left/right indicator; cant leans outward on the
              same sign as the side, toe's default convention runs opposite — see defaultFinSetup for why. */}
          {field('Cant (°)', Math.abs(slot.fin.cant), (v) => onChange({ cant: Math.sign(slot.railInset) * v }), 1)}
          {field('Toe (°)', Math.abs(slot.fin.toe), (v) => onChange({ toe: -Math.sign(slot.railInset) * v }), 1)}
        </>
      )}
    </div>
  )
}
