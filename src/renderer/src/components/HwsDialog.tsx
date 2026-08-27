import { useMemo, useState } from 'react'
import type { BoardState } from '../core/types'
import { defaultHwsConfig, generateRibProfiles, generateRailFrameProfiles, generateSpineProfile } from '../core/hws'
import type { HwsConfig } from '../core/hws'
import { layoutPartsOnSheets, countSheets, DEFAULT_SHEET_LAYOUT } from '../core/hwsLayout'
import type { HwsPart, SheetLayoutOptions } from '../core/hwsLayout'
import { exportHwsSheetsToDxf, exportHwsSheetsToSvg } from '../core/exportHws'
import { downloadTextFile } from '../core/exportSTL'

interface HwsDialogProps {
  board: BoardState
  onClose: () => void
}

const SHEET_PREVIEW_WIDTH_PX = 480

export function HwsDialog({ board, onClose }: HwsDialogProps): React.JSX.Element {
  const [config, setConfig] = useState<HwsConfig>(defaultHwsConfig())
  const [sheetOpts, setSheetOpts] = useState<SheetLayoutOptions>(DEFAULT_SHEET_LAYOUT)

  const set = <K extends keyof HwsConfig>(key: K, v: HwsConfig[K]): void => setConfig((c) => ({ ...c, [key]: v }))
  const setSheet = <K extends keyof SheetLayoutOptions>(key: K, v: SheetLayoutOptions[K]): void =>
    setSheetOpts((o) => ({ ...o, [key]: v }))

  const { placed, sheets, ribs, railFrames } = useMemo(() => {
    const ribs = generateRibProfiles(board, config)
    const railFrames = generateRailFrameProfiles(board, config)
    const spine = generateSpineProfile(board, config)

    const parts: HwsPart[] = [
      ...ribs.map((r, i) => ({ label: `Costola ${i + 1}`, outer: r.outer, holes: [r.hole] })),
      ...railFrames.map((r, i) => ({ label: `Telaio bordo ${i + 1}`, outer: r.outer, holes: [r.inner] })),
      { label: 'Spina centrale', outer: spine.outline, holes: [] }
    ]
    const placed = layoutPartsOnSheets(parts, sheetOpts)
    return { placed, sheets: countSheets(placed), ribs, railFrames }
  }, [board, config, sheetOpts])

  const scale = SHEET_PREVIEW_WIDTH_PX / Math.max(sheetOpts.sheetWidthCm, 1)
  const previewHeightPx = sheetOpts.sheetHeightCm * scale

  const handleExportDxf = (): void => {
    const files = exportHwsSheetsToDxf(placed, sheets)
    files.forEach((content, i) => downloadTextFile(`${board.name}_HWS_sheet${i + 1}.dxf`, content))
  }
  const handleExportSvg = (): void => {
    const files = exportHwsSheetsToSvg(placed, sheets, sheetOpts)
    files.forEach((content, i) => downloadTextFile(`${board.name}_HWS_sheet${i + 1}.svg`, content, 'image/svg+xml'))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <h3>🪵 Hollow Wood Surfboard — costole, spina, telaio bordo</h3>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -8 }}>
          Genera i profili 2D per taglio CNC/laser: {ribs.length} costole + {railFrames.length} telai bordo + 1 spina
          centrale, su {sheets} foglio{sheets === 1 ? '' : ''} di lastra.
        </p>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <div className="dims-field">
              <label>Numero costole</label>
              <input
                type="number"
                min={1}
                max={20}
                value={config.ribCount}
                onChange={(e) => set('ribCount', Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div className="dims-field">
              <label>Spessore lastra (cm)</label>
              <input
                type="number"
                step={0.1}
                min={0.1}
                value={config.materialThicknessCm}
                onChange={(e) => set('materialThicknessCm', Number(e.target.value))}
              />
            </div>
            <div className="dims-field">
              <label>Spessore pelle (cm)</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={config.skinThicknessCm}
                onChange={(e) => set('skinThicknessCm', Number(e.target.value))}
              />
            </div>
            <div className="dims-field">
              <label>Altezza mortasa spina (cm)</label>
              <input
                type="number"
                step={0.5}
                min={1}
                value={config.spineSlotHeightCm}
                onChange={(e) => set('spineSlotHeightCm', Number(e.target.value))}
              />
            </div>
            <div className="dims-field">
              <label>Larghezza telaio bordo (cm, 0 = disattiva)</label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={config.railFrameBandWidthCm}
                onChange={(e) => set('railFrameBandWidthCm', Number(e.target.value))}
              />
            </div>
            <div className="dims-field">
              <label>Compensazione taglio/kerf (cm)</label>
              <input
                type="number"
                step={0.01}
                min={0}
                value={config.kerfCm}
                onChange={(e) => set('kerfCm', Number(e.target.value))}
              />
            </div>
          </div>

          <div style={{ flex: '1 1 260px' }}>
            <div className="dims-field">
              <label>Larghezza lastra (cm)</label>
              <input
                type="number"
                min={10}
                value={sheetOpts.sheetWidthCm}
                onChange={(e) => setSheet('sheetWidthCm', Number(e.target.value))}
              />
            </div>
            <div className="dims-field">
              <label>Altezza lastra (cm)</label>
              <input
                type="number"
                min={10}
                value={sheetOpts.sheetHeightCm}
                onChange={(e) => setSheet('sheetHeightCm', Number(e.target.value))}
              />
            </div>
            <div className="dims-field">
              <label>Margine tra pezzi (cm)</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={sheetOpts.marginCm}
                onChange={(e) => setSheet('marginCm', Number(e.target.value))}
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Layout sequenziale semplice (non ottimizzato) — un pezzo alla volta, riga per riga. Puoi ancora
              riordinare i pezzi nel software CAM/laser dopo l&apos;esportazione.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '8px 0' }}>
          {Array.from({ length: sheets }, (_, s) => (
            <svg
              key={s}
              width={SHEET_PREVIEW_WIDTH_PX}
              height={previewHeightPx}
              style={{ background: '#1c1c1e', border: '1px solid var(--border)', flexShrink: 0 }}
            >
              {placed
                .filter((p) => p.sheetIndex === s)
                .map((p, i) => (
                  <g key={i}>
                    <polygon
                      points={p.outer.map((pt) => `${pt.x * scale},${pt.y * scale}`).join(' ')}
                      fill="rgba(88,166,255,0.25)"
                      stroke="#58a6ff"
                      strokeWidth={1}
                    />
                    {p.holes.map((h, hi) => (
                      <polygon
                        key={hi}
                        points={h.map((pt) => `${pt.x * scale},${pt.y * scale}`).join(' ')}
                        fill="#1c1c1e"
                        stroke="#ff9f0a"
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                ))}
            </svg>
          ))}
        </div>

        <div className="modal-actions">
          <button onClick={handleExportDxf}>⬇️ Esporta DXF ({sheets} foglio/i)</button>
          <button onClick={handleExportSvg}>⬇️ Esporta SVG ({sheets} foglio/i)</button>
          <button onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}
