import { useEffect, useRef, useState } from 'react'
import { CurveEditor2D } from './components/CurveEditor2D'
import { ThreeDView } from './components/ThreeDView'
import { CrossSectionEditor } from './components/CrossSectionEditor'
import { BoardSpecPanel } from './components/BoardSpecPanel'
import { TailDesignerDialog } from './components/TailDesignerDialog'
import { WeightCalculatorDialog } from './components/WeightCalculatorDialog'
import { FinSetupPanel } from './components/FinSetupPanel'
import { FinDesigner } from './components/FinDesigner'
import { FinPlacementMap } from './components/FinPlacementMap'
import { DesignEditor } from './components/DesignEditor'
import { defaultBoard } from './core/types'
import type { BoardState, CurveCP } from './core/types'
import type { Point } from './core/bezier'
import type { FinInstance, FinSetup } from './core/finTypes'
import type { BoardDesign } from './core/design'
import { BOARD_TEMPLATES, buildBoardFromTemplate } from './core/boardTemplates'
import { useBoardHistory } from './core/useBoardHistory'
import { applyTailToOutline } from './core/tailShape'
import { exportBoardToStl, downloadTextFile } from './core/exportSTL'
import { exportBoardToDxf } from './core/exportDXF'
import { exportOutlineGcode } from './core/exportGcode'

type TabKey = 'quad' | 'outline' | 'rocker' | 'crosssections' | 'fins' | 'design' | '3d'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'quad', label: '▦ Quad View' },
  { key: 'outline', label: '📐 Outline' },
  { key: 'rocker', label: '🌊 Rocker & Thickness' },
  { key: 'crosssections', label: '🛹 Cross Sections' },
  { key: 'fins', label: '🦈 Pinne' },
  { key: 'design', label: '🎨 Design' },
  { key: '3d', label: '🧊 3D View' }
]

const SIDEBAR_MIN = 190
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 260

function App(): React.JSX.Element {
  const { board, setBoard, beginEdit, endEdit, undo, redo, canUndo, canRedo } = useBoardHistory(defaultBoard())
  const [tab, setTab] = useState<TabKey>('quad')
  const [tailDialogOpen, setTailDialogOpen] = useState(false)
  const [weightDialogOpen, setWeightDialogOpen] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(board.finSetup.slots[0]?.id ?? null)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const resizingRef = useRef(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const halfWidth = board.width / 2

  const updateOutline = (_idx: number, points: CurveCP): void => {
    setBoard((b) => ({ ...b, outline: points }))
  }
  const updateRockerCurve = (idx: number, points: CurveCP): void => {
    setBoard((b) => (idx === 0 ? { ...b, rocker: points } : { ...b, deck: points }))
  }
  const updateCrossSection = (stationIndex: number, points: Point[]): void => {
    setBoard((b) => ({
      ...b,
      crossSections: b.crossSections.map((s, i) => (i === stationIndex ? { ...s, points } : s))
    }))
  }

  const setDim = (key: keyof Pick<BoardState, 'length' | 'width' | 'thickness'>, v: number): void => {
    setBoard((b) => ({ ...b, [key]: v }))
  }

  const updateFinSetup = (finSetup: FinSetup): void => {
    setBoard((b) => ({ ...b, finSetup }))
  }
  const updateSlotFin = (fin: FinInstance): void => {
    if (!selectedSlotId) return
    setBoard((b) => ({
      ...b,
      finSetup: { ...b.finSetup, slots: b.finSetup.slots.map((s) => (s.id === selectedSlotId ? { ...s, fin } : s)) }
    }))
  }

  const applyTemplate = (templateId: string): void => {
    const template = BOARD_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    const newBoard = buildBoardFromTemplate(template)
    setBoard(() => newBoard)
    setSelectedSlotId(newBoard.finSetup.slots[0]?.id ?? null)
  }

  const applyTailShape = (tail: BoardState['tailShape'], outlineTailY: number): void => {
    setBoard((b) => ({
      ...b,
      tailShape: tail,
      outline: [b.outline[0], b.outline[1], b.outline[2], { ...b.outline[3], y: outlineTailY }]
    }))
  }

  const updateDesign = (design: BoardDesign): void => {
    setBoard((b) => ({ ...b, design }))
  }

  const safeName = (): string => board.name.trim().replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'board'
  const exportStl = (): void => downloadTextFile(`${safeName()}.stl`, exportBoardToStl(board))
  const exportDxf = (): void => downloadTextFile(`${safeName()}.dxf`, exportBoardToDxf(board))
  const exportGcode = (): void => downloadTextFile(`${safeName()}_outline.nc`, exportOutlineGcode(board))

  const startSidebarResize = (): void => {
    resizingRef.current = true
    const onMove = (e: MouseEvent): void => {
      if (!resizingRef.current) return
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX)))
    }
    const onUp = (): void => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const renderOutlineEditor = (): React.JSX.Element => (
    <>
      <CurveEditor2D
        curves={[
          {
            label: 'Outline',
            color: '#007aff',
            points: board.outline,
            renderOverride: (samples) => applyTailToOutline(samples, board.length, board.tailShape)
          }
        ]}
        onChange={updateOutline}
        length={board.length}
        maxY={halfWidth + 5}
        symmetric
        noseTailIndicators
        onDragStart={beginEdit}
        onDragEnd={endEdit}
      />
      <div className="legend">
        <span>
          <span className="dot" style={{ background: '#007aff' }} /> Outline
        </span>
      </div>
    </>
  )

  const renderRockerEditor = (): React.JSX.Element => (
    <>
      <CurveEditor2D
        curves={[
          { label: 'Rocker', color: '#ff3b30', points: board.rocker },
          { label: 'Deck', color: '#28cd41', points: board.deck }
        ]}
        onChange={updateRockerCurve}
        length={board.length}
        maxY={Math.max(board.thickness * 2, 15)}
        noseTailIndicators
        onDragStart={beginEdit}
        onDragEnd={endEdit}
      />
      <div className="legend">
        <span>
          <span className="dot" style={{ background: '#ff3b30' }} /> Rocker
        </span>
        <span>
          <span className="dot" style={{ background: '#28cd41' }} /> Deck
        </span>
      </div>
    </>
  )

  const renderCrossSections = (): React.JSX.Element => (
    <CrossSectionEditor stations={board.crossSections} onChange={updateCrossSection} onDragStart={beginEdit} onDragEnd={endEdit} />
  )

  const render3D = (): React.JSX.Element => <ThreeDView board={board} />

  const renderDesign = (): React.JSX.Element => (
    <DesignEditor
      design={board.design}
      onChange={updateDesign}
      outline={board.outline}
      length={board.length}
      width={board.width}
      onDragStart={beginEdit}
      onDragEnd={endEdit}
    />
  )

  const selectedSlot = board.finSetup.slots.find((s) => s.id === selectedSlotId) ?? null

  const renderFins = (): React.JSX.Element => (
    <div style={{ display: 'grid', gridTemplateRows: '220px 1fr', height: '100%', minHeight: 0 }}>
      <div style={{ borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <div className="quad-cell-label">Posizionamento pinne (top view — trascina per spostare)</div>
        <div style={{ height: 'calc(100% - 24px)' }}>
          <FinPlacementMap
            setup={board.finSetup}
            onChange={updateFinSetup}
            outline={board.outline}
            length={board.length}
            width={board.width}
            selectedSlotId={selectedSlotId}
            onSelectSlot={setSelectedSlotId}
            onDragStart={beginEdit}
            onDragEnd={endEdit}
          />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 0 }}>
        <div style={{ borderRight: '1px solid var(--border)' }}>
          <FinSetupPanel
            setup={board.finSetup}
            onChange={updateFinSetup}
            selectedSlotId={selectedSlotId}
            onSelectSlot={setSelectedSlotId}
            onDragStart={beginEdit}
            onDragEnd={endEdit}
          />
        </div>
        <div>
          {selectedSlot ? (
            <FinDesigner fin={selectedSlot.fin} onChange={updateSlotFin} onDragStart={beginEdit} onDragEnd={endEdit} />
          ) : (
            <div style={{ padding: 20, color: 'var(--text-dim)' }}>Seleziona una pinna dalla lista a sinistra.</div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="app">
      <div className="titlebar">
        <span>🏄‍♂️ SURF-CAD Electron — {board.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Copyright © Lobbene Giuseppe Design 2025</span>
      </div>

      <div className="toolbar">
        <button title="New Board">🆕 New</button>
        <button title="Open">📂 Open</button>
        <button title="Save">💾 Save</button>
        <div className="sep" />
        <select
          title="Template Tavola"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyTemplate(e.target.value)
            e.target.value = ''
          }}
        >
          <option value="" disabled>
            🏄 Template Tavola…
          </option>
          {BOARD_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} title={t.description}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="sep" />
        <button title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={undo}>
          ↶ Undo
        </button>
        <button title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!canRedo} onClick={redo}>
          ↷ Redo
        </button>
        <div className="sep" />
        <button title="Tail Designer" onClick={() => setTailDialogOpen(true)}>
          🏄 Tail Designer
        </button>
        <button title="Weight Calculator" onClick={() => setWeightDialogOpen(true)}>
          ⚖️ Weight
        </button>
        <div className="sep" />
        <button title="Export STL (mesh 3D)" onClick={exportStl}>
          ⬇️ STL
        </button>
        <button title="Export DXF (outline + profilo)" onClick={exportDxf}>
          ⬇️ DXF
        </button>
        <button title="Export G-code (contorno outline)" onClick={exportGcode}>
          ⬇️ G-code
        </button>
      </div>

      <div className="main-area">
        {sidebarCollapsed ? (
          <button className="sidebar-expand" title="Mostra pannello dimensioni" onClick={() => setSidebarCollapsed(false)}>
            ▶
          </button>
        ) : (
          <>
            <div className="dims-panel" style={{ width: sidebarWidth }}>
              <div className="dims-panel-header">
                <h3 style={{ margin: 0 }}>Dimensioni</h3>
                <button className="sidebar-collapse" title="Nascondi pannello" onClick={() => setSidebarCollapsed(true)}>
                  ◀
                </button>
              </div>
              <div className="dims-field">
                <label>Lunghezza (cm)</label>
                <input
                  type="number"
                  value={board.length}
                  onChange={(e) => setDim('length', Number(e.target.value))}
                  onFocus={beginEdit}
                  onBlur={endEdit}
                />
              </div>
              <div className="dims-field">
                <label>Larghezza (cm)</label>
                <input
                  type="number"
                  value={board.width}
                  onChange={(e) => setDim('width', Number(e.target.value))}
                  onFocus={beginEdit}
                  onBlur={endEdit}
                />
              </div>
              <div className="dims-field">
                <label>Spessore (cm)</label>
                <input
                  type="number"
                  value={board.thickness}
                  onChange={(e) => setDim('thickness', Number(e.target.value))}
                  onFocus={beginEdit}
                  onBlur={endEdit}
                />
              </div>

              <BoardSpecPanel board={board} />
            </div>
            <div className="sidebar-resize-handle" onMouseDown={startSidebarResize} />
          </>
        )}

        <div className="center">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {tab === 'quad' && (
              <div className="quad-view">
                <div className="quad-cell">
                  <div className="quad-cell-label">Outline (Top View)</div>
                  <div className="quad-cell-body">{renderOutlineEditor()}</div>
                </div>
                <div className="quad-cell">
                  <div className="quad-cell-label">Cross Sections</div>
                  <div className="quad-cell-body">{renderCrossSections()}</div>
                </div>
                <div className="quad-cell">
                  <div className="quad-cell-label">Rocker &amp; Thickness (Side View)</div>
                  <div className="quad-cell-body">{renderRockerEditor()}</div>
                </div>
                <div className="quad-cell">
                  <div className="quad-cell-label">Rendered 3D View</div>
                  <div className="quad-cell-body">{render3D()}</div>
                </div>
              </div>
            )}
            {tab === 'outline' && renderOutlineEditor()}
            {tab === 'rocker' && renderRockerEditor()}
            {tab === 'crosssections' && renderCrossSections()}
            {tab === 'fins' && renderFins()}
            {tab === 'design' && renderDesign()}
            {tab === '3d' && render3D()}
          </div>
        </div>
      </div>

      <div className="statusbar">
        Lunghezza {board.length}cm · Larghezza {board.width}cm · Spessore {board.thickness}cm · Coda:{' '}
        {board.tailShape.type} — Modifica le curve nei tab, poi vai su 3D View o Quad View per vedere il
        risultato in tempo reale.
      </div>

      {tailDialogOpen && (
        <TailDesignerDialog
          tailShape={board.tailShape}
          boardWidth={board.width}
          onApply={applyTailShape}
          onClose={() => setTailDialogOpen(false)}
        />
      )}

      {weightDialogOpen && <WeightCalculatorDialog board={board} onClose={() => setWeightDialogOpen(false)} />}
    </div>
  )
}

export default App
