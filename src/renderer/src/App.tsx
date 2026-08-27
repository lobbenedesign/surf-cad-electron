import { useEffect, useRef, useState } from 'react'
import { CurveEditor2D } from './components/CurveEditor2D'
import { ThreeDView } from './components/ThreeDView'
import { CrossSectionEditor } from './components/CrossSectionEditor'
import { BoardSpecPanel } from './components/BoardSpecPanel'
import { TailDesignerDialog } from './components/TailDesignerDialog'
import { WeightCalculatorDialog } from './components/WeightCalculatorDialog'
import { HwsDialog } from './components/HwsDialog'
import { VolumeWizardDialog } from './components/VolumeWizardDialog'
import { ReferenceImageControls } from './components/ReferenceImageControls'
import { CurveModeToolbar } from './components/CurveModeToolbar'
import type { ReferenceImage } from './core/referenceImage'
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
import { exportBoardToDxf, exportBoardToDxfSpline } from './core/exportDXF'
import { exportOutlineGcode, exportProfileGcode, exportSurfaceGcode } from './core/exportGcode'
import { exportSpecSheetPdf } from './core/specSheetPdf'
import { exportPrintSheetPdf } from './core/printSheetPdf'
import { exportFinMountingSummaryPdf, exportFinMountingTemplatePdf } from './core/finMountingPdf'
import { bestFitCubicBezier } from './core/curveFit'
import { slaveEndpointY, hasSharpKink, fullTangentLock } from './core/curveConstraints'
import { serializeBoard, deserializeBoard, saveAutosave, loadAutosave } from './core/serialization'
import { parseBrdFile } from './core/importBrd'
import { parseS3dFile } from './core/importS3d'
import { parseSrfFile } from './core/importSrf'
import { defaultDeckStep, type DeckStep } from './core/deckStep'
import { chamferAnchor, extendAnchor, filletAnchor, removePathPoint } from './core/outlinePath'
import { cmToImperialStr } from './core/units'

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

/** Views that support the per-view fullscreen overlay (Outline/Rocker/Cross Sections/3D — not Fins/Design, which already use the whole tab area for a multi-panel layout). */
type FullscreenableView = 'outline' | 'rocker' | 'crosssections' | '3d'

const FULLSCREEN_LABELS: Record<FullscreenableView, string> = {
  outline: '📐 Outline (Top View)',
  rocker: '🌊 Rocker & Thickness (Side View)',
  crosssections: '🛹 Cross Sections',
  '3d': '🧊 3D View'
}

/** Small floating trigger, positioned top-left inside a `position: relative` view container, that opens that view in the full-window overlay. */
function FullscreenButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button className="view-fullscreen-btn" title="Schermo intero" onClick={onClick}>
      ⛶
    </button>
  )
}

const TAIL_LABELS: Record<BoardState['tailShape']['type'], string> = {
  round: 'Round',
  square: 'Square',
  pin: 'Pin',
  squash: 'Squash',
  swallow: 'Swallow'
}

function App(): React.JSX.Element {
  // Restore the last session's board (autosaved on every change) so a reload or
  // app restart never silently loses work — the whole point of a CAD document.
  const { board, setBoard, beginEdit, endEdit, undo, redo, canUndo, canRedo } = useBoardHistory(
    loadAutosave() ?? defaultBoard()
  )
  const [tab, setTab] = useState<TabKey>('quad')
  const [tailDialogOpen, setTailDialogOpen] = useState(false)
  const [weightDialogOpen, setWeightDialogOpen] = useState(false)
  const [volumeDialogOpen, setVolumeDialogOpen] = useState(false)
  const [hwsDialogOpen, setHwsDialogOpen] = useState(false)
  const [ghostBoard, setGhostBoard] = useState<BoardState | null>(null)
  const [ghostSelectValue, setGhostSelectValue] = useState('')
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(board.finSetup.slots[0]?.id ?? null)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const resizingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const brdInputRef = useRef<HTMLInputElement>(null)
  const s3dInputRef = useRef<HTMLInputElement>(null)
  const srfInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ board: BoardState; warnings: string[]; label: string } | null>(null)
  // The Ctrl/Cmd+S handler lives in a mount-once effect; a ref keeps it pointed
  // at the latest board without re-registering the listener on every change.
  const saveShortcutRef = useRef<() => void>(() => {})
  const [outlineMode, setOutlineMode] = useState<'edit' | 'digitize' | 'measure' | 'draw'>('edit')
  const [rockerMode, setRockerMode] = useState<'edit' | 'digitize' | 'measure' | 'draw'>('edit')
  const [outlineDigitized, setOutlineDigitized] = useState<Point[]>([])
  const [rockerDigitized, setRockerDigitized] = useState<Point[]>([])
  const [outlineSelected, setOutlineSelected] = useState<{ curve: number; point: number } | null>(null)
  const [outlineToolAmount, setOutlineToolAmount] = useState(2)
  const [outlineSmoothAnchors, setOutlineSmoothAnchors] = useState(false)
  const [fullscreenView, setFullscreenView] = useState<FullscreenableView | null>(null)
  // Tangent-lock toggles (core/curveConstraints.ts v3) — session-only UI state,
  // not part of BoardState/the save file: they gate how *future* drags behave,
  // not a property of the curve's current shape.
  const [rockerLocks, setRockerLocks] = useState({ start: false, end: false })
  const [deckLocks, setDeckLocks] = useState({ start: false, end: false })

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
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveShortcutRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // Debounced autosave: a drag gesture fires dozens of board updates per second,
  // and serializing the whole document (with any data-URL images) each time would
  // jank the drag — 600ms after the last change is invisible to the user but
  // still guarantees a reload never loses more than a moment of work.
  useEffect(() => {
    const id = window.setTimeout(() => saveAutosave(board), 600)
    return () => window.clearTimeout(id)
  }, [board])

  const halfWidth = board.width / 2

  const updateOutline = (_idx: number, points: Point[]): void => {
    setBoard((b) => ({ ...b, outline: points }))
  }
  const updateOutlineOpposite = (_idx: number, points: Point[]): void => {
    setBoard((b) => ({ ...b, outlineOpposite: points }))
  }
  const handleOutlineChange = (curveIndex: number, points: Point[]): void => {
    if (curveIndex === 0) updateOutline(0, points)
    else if (!board.outlineSymmetric && curveIndex === 1) updateOutlineOpposite(0, points)
  }

  const outlineSelectedIsInteriorAnchor = (): boolean => {
    if (!outlineSelected) return false
    const points = outlineSelected.curve === 0 ? board.outline : (board.outlineOpposite ?? board.outline)
    return outlineSelected.point % 3 === 0 && outlineSelected.point > 0 && outlineSelected.point < points.length - 1
  }
  const applyOutlineFillet = (): void => {
    if (!outlineSelectedIsInteriorAnchor()) return
    const { curve, point } = outlineSelected as { curve: number; point: number }
    const points = curve === 0 ? board.outline : (board.outlineOpposite ?? board.outline)
    beginEdit()
    handleOutlineChange(curve, filletAnchor(points, point / 3, outlineToolAmount))
    endEdit()
    setOutlineSelected(null)
  }
  const applyOutlineChamfer = (): void => {
    if (!outlineSelectedIsInteriorAnchor()) return
    const { curve, point } = outlineSelected as { curve: number; point: number }
    const points = curve === 0 ? board.outline : (board.outlineOpposite ?? board.outline)
    beginEdit()
    handleOutlineChange(curve, chamferAnchor(points, point / 3, outlineToolAmount))
    endEdit()
    setOutlineSelected(null)
  }
  const applyOutlineTrim = (): void => {
    if (!outlineSelectedIsInteriorAnchor()) return
    const { curve, point } = outlineSelected as { curve: number; point: number }
    const points = curve === 0 ? board.outline : (board.outlineOpposite ?? board.outline)
    beginEdit()
    handleOutlineChange(curve, removePathPoint(points, point))
    endEdit()
    setOutlineSelected(null)
  }
  const applyOutlineExtend = (): void => {
    if (!outlineSelectedIsInteriorAnchor()) return
    const { curve, point } = outlineSelected as { curve: number; point: number }
    const points = curve === 0 ? board.outline : (board.outlineOpposite ?? board.outline)
    beginEdit()
    handleOutlineChange(curve, extendAnchor(points, point / 3, outlineToolAmount))
    endEdit()
  }
  const toggleOutlineSymmetric = (): void => {
    setBoard((b) =>
      b.outlineSymmetric
        ? { ...b, outlineSymmetric: false, outlineOpposite: b.outlineOpposite ?? b.outline.map((p) => ({ ...p })) }
        : { ...b, outlineSymmetric: true }
    )
  }
  const updateRockerCurve = (idx: number, points: Point[]): void => {
    const cp = points as CurveCP
    setBoard((b) =>
      idx === 0
        ? { ...b, rocker: cp, deck: slaveEndpointY(b.rocker, cp, b.deck) }
        : { ...b, deck: cp, rocker: slaveEndpointY(b.deck, cp, b.rocker) }
    )
  }

  const applyOutlineFit = (): void => {
    const fitted = bestFitCubicBezier(outlineDigitized)
    if (!fitted) return
    beginEdit()
    updateOutline(0, fitted)
    endEdit()
    setOutlineDigitized([])
    setOutlineMode('edit')
  }
  const applyRockerFit = (): void => {
    const fitted = bestFitCubicBezier(rockerDigitized)
    if (!fitted) return
    beginEdit()
    updateRockerCurve(0, fitted)
    endEdit()
    setRockerDigitized([])
    setRockerMode('edit')
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

  const toggleDeckStep = (enabled: boolean): void => {
    setBoard((b) => ({ ...b, deckStep: enabled ? (b.deckStep ?? defaultDeckStep()) : undefined }))
  }
  const updateDeckStep = (patch: Partial<DeckStep>): void => {
    setBoard((b) => (b.deckStep ? { ...b, deckStep: { ...b.deckStep, ...patch } } : b))
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
    setBoard((b) => {
      const tailIdx = b.outline.length - 1
      return {
        ...b,
        tailShape: tail,
        outline: b.outline.map((p, i) => (i === tailIdx ? { ...p, y: outlineTailY } : p))
      }
    })
  }

  const updateDesign = (design: BoardDesign): void => {
    setBoard((b) => ({ ...b, design }))
  }

  const updateReferenceImage = (view: 'outline' | 'rocker', image: ReferenceImage | null): void => {
    setBoard((b) => ({
      ...b,
      referenceImages: { ...b.referenceImages, [view]: image ?? undefined }
    }))
  }

  const safeName = (): string => board.name.trim().replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'board'

  // New/Open/Save operate on the whole document. All three go through the same
  // history `setBoard`, so each is a single undoable step — New/Open by mistake
  // is one Ctrl+Z away from recovery, no confirm dialog needed.
  const newBoard = (): void => {
    setBoard(() => defaultBoard())
    setSelectedSlotId(defaultBoard().finSetup.slots[0]?.id ?? null)
    setOutlineDigitized([])
    setRockerDigitized([])
  }
  const saveBoard = (): void =>
    downloadTextFile(`${safeName()}.surfcad.json`, serializeBoard(board), 'application/json')
  // Assegnato in un effect, non nel corpo del render: mutare un ref durante il
  // render è disallowato sotto React concurrent/Strict Mode (può girare più o
  // meno volte del previsto). Un effect senza dipendenze gira dopo ogni commit,
  // stesso risultato pratico (sempre l'ultima saveBoard) senza il rischio.
  useEffect(() => {
    saveShortcutRef.current = saveBoard
  })
  const openBoard = (): void => fileInputRef.current?.click()
  const handleOpenFile = (files: FileList | null): void => {
    const file = files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const loaded = deserializeBoard(reader.result as string)
        setBoard(() => loaded)
        setSelectedSlotId(loaded.finSetup.slots[0]?.id ?? null)
      } catch (err) {
        window.alert(`Impossibile aprire il file: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    reader.readAsText(file)
    // Reset so re-opening the same file fires onChange again.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openBrdImport = (): void => brdInputRef.current?.click()
  const openS3dImport = (): void => s3dInputRef.current?.click()

  const handleLegacyImportFile = (
    files: FileList | null,
    inputRef: React.RefObject<HTMLInputElement | null>,
    label: string,
    parse: (text: string) => { board: BoardState; warnings: string[] }
  ): void => {
    const file = files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const { board: imported, warnings } = parse(reader.result as string)
        if (warnings.length > 0) {
          setPendingImport({ board: imported, warnings, label })
        } else {
          setBoard(() => imported)
          setSelectedSlotId(imported.finSetup.slots[0]?.id ?? null)
        }
      } catch (err) {
        window.alert(`Impossibile importare il file ${label}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    reader.readAsText(file)
    if (inputRef.current) inputRef.current.value = ''
  }
  const handleBrdFile = (files: FileList | null): void => handleLegacyImportFile(files, brdInputRef, '.brd', parseBrdFile)
  const handleS3dFile = (files: FileList | null): void => handleLegacyImportFile(files, s3dInputRef, '.s3d/.s3dx', parseS3dFile)
  const handleSrfFile = (files: FileList | null): void => {
    const file = files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const { board: imported, warnings } = parseSrfFile(reader.result as ArrayBuffer)
        if (warnings.length > 0) {
          setPendingImport({ board: imported, warnings, label: '.srf' })
        } else {
          setBoard(() => imported)
          setSelectedSlotId(imported.finSetup.slots[0]?.id ?? null)
        }
      } catch (err) {
        window.alert(`Impossibile importare il file .srf: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    reader.readAsArrayBuffer(file)
    if (srfInputRef.current) srfInputRef.current.value = ''
  }
  const openSrfImport = (): void => srfInputRef.current?.click()

  const confirmPendingImport = (): void => {
    if (!pendingImport) return
    setBoard(() => pendingImport.board)
    setSelectedSlotId(pendingImport.board.finSetup.slots[0]?.id ?? null)
    setPendingImport(null)
  }
  const exportStl = (): void => downloadTextFile(`${safeName()}.stl`, exportBoardToStl(board))
  const exportDxf = (): void => downloadTextFile(`${safeName()}.dxf`, exportBoardToDxf(board, ghostBoard))
  const exportDxfSpline = (): void => downloadTextFile(`${safeName()}_spline.dxf`, exportBoardToDxfSpline(board, ghostBoard))
  const exportGcode = (): void => downloadTextFile(`${safeName()}_outline.nc`, exportOutlineGcode(board))
  const exportAdvancedGcode = (kind: string): void => {
    if (kind === 'profile-rocker') downloadTextFile(`${safeName()}_profile_rocker.nc`, exportProfileGcode(board, 'rocker'))
    else if (kind === 'profile-deck') downloadTextFile(`${safeName()}_profile_deck.nc`, exportProfileGcode(board, 'deck'))
    else if (kind === 'surface-deck') downloadTextFile(`${safeName()}_surface_deck.nc`, exportSurfaceGcode(board, 'deck'))
    else if (kind === 'surface-bottom') downloadTextFile(`${safeName()}_surface_bottom.nc`, exportSurfaceGcode(board, 'bottom'))
  }
  const exportFinMountingSheet = (kind: string): void => {
    if (kind === 'summary-a4') exportFinMountingSummaryPdf(board, { pageSize: 'a4', showDimensions: true })
    else if (kind === 'summary-a4-clean') exportFinMountingSummaryPdf(board, { pageSize: 'a4', showDimensions: false })
    else if (kind === 'summary-a3') exportFinMountingSummaryPdf(board, { pageSize: 'a3', showDimensions: true })
    else if (kind === 'summary-a3-clean') exportFinMountingSummaryPdf(board, { pageSize: 'a3', showDimensions: false })
    else if (kind === 'template-1-1') exportFinMountingTemplatePdf(board, { showDimensions: true })
    else if (kind === 'template-1-1-clean') exportFinMountingTemplatePdf(board, { showDimensions: false })
  }

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

  const renderOutlineEditor = (): React.JSX.Element => {
    const outlineCurves = board.outlineSymmetric
      ? [
          {
            label: 'Outline',
            color: '#007aff',
            points: board.outline,
            renderOverride: (samples: Point[]) => applyTailToOutline(samples, board.length, board.tailShape)
          }
        ]
      : [
          { label: 'Outline (destra)', color: '#007aff', points: board.outline },
          { label: 'Outline (sinistra)', color: '#5ac8fa', points: board.outlineOpposite ?? board.outline }
        ]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <ReferenceImageControls
          image={board.referenceImages.outline}
          onChange={(img) => updateReferenceImage('outline', img)}
        />
        <CurveModeToolbar
          mode={outlineMode}
          onModeChange={setOutlineMode}
          digitizedCount={outlineDigitized.length}
          onApplyFit={applyOutlineFit}
          onClearDigitized={() => setOutlineDigitized([])}
          showDrawMode
          symmetricToggle={{ symmetric: board.outlineSymmetric, onToggle: toggleOutlineSymmetric }}
        />
        <div className="ref-image-bar" style={{ opacity: outlineSelectedIsInteriorAnchor() ? 1 : 0.5 }}>
          <span style={{ color: 'var(--text-dim)' }}>
            {outlineSelectedIsInteriorAnchor()
              ? `Punto ${(outlineSelected as { curve: number; point: number }).point} selezionato`
              : 'Seleziona un punto interno (nodo) per fillet/chamfer/trim/extend'}
          </span>
          <label>
            Raggio/distanza (cm)
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={outlineToolAmount}
              onChange={(e) => setOutlineToolAmount(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
          <button onClick={applyOutlineFillet} disabled={!outlineSelectedIsInteriorAnchor()}>
            ⌒ Fillet
          </button>
          <button onClick={applyOutlineChamfer} disabled={!outlineSelectedIsInteriorAnchor()}>
            ⟋ Chamfer
          </button>
          <button onClick={applyOutlineTrim} disabled={!outlineSelectedIsInteriorAnchor()}>
            ✂️ Trim
          </button>
          <button onClick={applyOutlineExtend} disabled={!outlineSelectedIsInteriorAnchor()}>
            ↔️ Extend
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 12 }}>
            <input
              type="checkbox"
              checked={outlineSmoothAnchors}
              onChange={(e) => setOutlineSmoothAnchors(e.target.checked)}
            />
            🔗 Nodi lisci (tangente continua)
          </label>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {fullscreenView !== 'outline' && <FullscreenButton onClick={() => setFullscreenView('outline')} />}
          <CurveEditor2D
            backgroundImage={board.referenceImages.outline}
            curves={[
              ...outlineCurves,
              ...(ghostBoard
                ? [
                    {
                      label: 'Ghost',
                      color: '#9d9d9d',
                      points: ghostBoard.outline,
                      readOnly: true,
                      renderOverride: (samples: Point[]) => applyTailToOutline(samples, ghostBoard.length, ghostBoard.tailShape)
                    }
                  ]
                : [])
            ]}
            onChange={handleOutlineChange}
            length={board.length}
            maxY={halfWidth + 5}
            symmetric={board.outlineSymmetric}
            asymmetricPairIndex={board.outlineSymmetric ? undefined : 1}
            allowPathEditing
            noseTailIndicators
            onDragStart={beginEdit}
            onDragEnd={endEdit}
            interactionMode={outlineMode}
            digitizedPoints={outlineDigitized}
            onDigitizeClick={(p) => setOutlineDigitized((pts) => [...pts, p])}
            onSelectedPointChange={setOutlineSelected}
            smoothAnchors={outlineSmoothAnchors}
          />
          <div className="legend">
            {board.outlineSymmetric ? (
              <span>
                <span className="dot" style={{ background: '#007aff' }} /> Outline
              </span>
            ) : (
              <>
                <span>
                  <span className="dot" style={{ background: '#007aff' }} /> Destra
                </span>
                <span>
                  <span className="dot" style={{ background: '#5ac8fa' }} /> Sinistra
                </span>
              </>
            )}
            {ghostBoard && (
              <span>
                <span className="dot" style={{ background: '#9d9d9d' }} /> Ghost
              </span>
            )}
            {hasSharpKink(board.outline) && (
              <span className="kink-warning" title="Il poligono di controllo piega bruscamente qui — probabile spigolo visibile invece di una curva C2 liscia">
                ⚠ Spigolo vivo
              </span>
            )}
            {!board.outlineSymmetric && hasSharpKink(board.outlineOpposite ?? board.outline) && (
              <span className="kink-warning" title="Il poligono di controllo del lato sinistro piega bruscamente qui">
                ⚠ Spigolo sinistra
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderRockerEditor = (): React.JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ReferenceImageControls
        image={board.referenceImages.rocker}
        onChange={(img) => updateReferenceImage('rocker', img)}
      />
      <CurveModeToolbar
        mode={rockerMode}
        onModeChange={setRockerMode}
        digitizedCount={rockerDigitized.length}
        onApplyFit={applyRockerFit}
        onClearDigitized={() => setRockerDigitized([])}
      />
      <div className="ref-image-bar" style={{ fontSize: 12 }}>
        <span style={{ color: 'var(--text-dim)' }}>Tangent-lock (blocca la maniglia a non superare l&apos;ancora):</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={rockerLocks.start} onChange={(e) => setRockerLocks((l) => ({ ...l, start: e.target.checked }))} />
          Rocker naso
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={rockerLocks.end} onChange={(e) => setRockerLocks((l) => ({ ...l, end: e.target.checked }))} />
          Rocker coda
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={deckLocks.start} onChange={(e) => setDeckLocks((l) => ({ ...l, start: e.target.checked }))} />
          Deck naso
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={deckLocks.end} onChange={(e) => setDeckLocks((l) => ({ ...l, end: e.target.checked }))} />
          Deck coda
        </label>
      </div>
      <div className="ref-image-bar" style={{ fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={!!board.deckStep} onChange={(e) => toggleDeckStep(e.target.checked)} />
          Deck step (rialzo coda)
        </label>
        {board.deckStep && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Posizione
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={board.deckStep.position}
                onChange={(e) => updateDeckStep({ position: Number(e.target.value) })}
                style={{ width: 56 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Altezza (cm)
              <input
                type="number"
                step={0.1}
                min={0}
                value={board.deckStep.height}
                onChange={(e) => updateDeckStep({ height: Number(e.target.value) })}
                style={{ width: 56 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Transizione (cm)
              <input
                type="number"
                step={1}
                min={0.1}
                value={board.deckStep.transitionCm}
                onChange={(e) => updateDeckStep({ transitionCm: Number(e.target.value) })}
                style={{ width: 56 }}
              />
            </label>
          </>
        )}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {fullscreenView !== 'rocker' && <FullscreenButton onClick={() => setFullscreenView('rocker')} />}
        <CurveEditor2D
          backgroundImage={board.referenceImages.rocker}
          curves={[
            {
              label: 'Rocker',
              color: '#ff3b30',
              points: board.rocker,
              tangentLocks: { start: fullTangentLock(rockerLocks.start), end: fullTangentLock(rockerLocks.end) }
            },
            {
              label: 'Deck',
              color: '#28cd41',
              points: board.deck,
              tangentLocks: { start: fullTangentLock(deckLocks.start), end: fullTangentLock(deckLocks.end) }
            },
            ...(ghostBoard
              ? [
                  { label: 'Ghost Rocker', color: '#9d9d9d', points: ghostBoard.rocker, readOnly: true },
                  { label: 'Ghost Deck', color: '#6d6d6d', points: ghostBoard.deck, readOnly: true }
                ]
              : [])
          ]}
          onChange={updateRockerCurve}
          length={board.length}
          maxY={Math.max(board.thickness * 2, 15)}
          noseTailIndicators
          onDragStart={beginEdit}
          onDragEnd={endEdit}
          interactionMode={rockerMode}
          digitizedPoints={rockerDigitized}
          onDigitizeClick={(p) => setRockerDigitized((pts) => [...pts, p])}
        />
        <div className="legend">
          <span>
            <span className="dot" style={{ background: '#ff3b30' }} /> Rocker
          </span>
          <span>
            <span className="dot" style={{ background: '#28cd41' }} /> Deck
          </span>
          {ghostBoard && (
            <span>
              <span className="dot" style={{ background: '#9d9d9d' }} /> Ghost
            </span>
          )}
          {hasSharpKink(board.rocker) && (
            <span className="kink-warning" title="Il poligono di controllo del Rocker piega bruscamente — probabile spigolo visibile">
              ⚠ Spigolo Rocker
            </span>
          )}
          {hasSharpKink(board.deck) && (
            <span className="kink-warning" title="Il poligono di controllo del Deck piega bruscamente — probabile spigolo visibile">
              ⚠ Spigolo Deck
            </span>
          )}
        </div>
      </div>
    </div>
  )

  const renderCrossSections = (): React.JSX.Element => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {fullscreenView !== 'crosssections' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 8px', borderBottom: '1px solid var(--border)' }}>
          <FullscreenButton onClick={() => setFullscreenView('crosssections')} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <CrossSectionEditor stations={board.crossSections} onChange={updateCrossSection} onDragStart={beginEdit} onDragEnd={endEdit} />
      </div>
    </div>
  )

  const render3D = (): React.JSX.Element => (
    <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
      {fullscreenView !== '3d' && <FullscreenButton onClick={() => setFullscreenView('3d')} />}
      <ThreeDView
        board={board}
        selectedFinId={selectedSlotId}
        onSelectFin={setSelectedSlotId}
        onFinSetupChange={updateFinSetup}
        onDragStart={beginEdit}
        onDragEnd={endEdit}
      />
    </div>
  )

  const renderDesign = (): React.JSX.Element => (
    <DesignEditor
      design={board.design}
      onChange={updateDesign}
      outline={board.outline}
      outlineOpposite={board.outlineSymmetric ? undefined : board.outlineOpposite}
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
            outlineOpposite={board.outlineSymmetric ? undefined : board.outlineOpposite}
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
        <button title="Nuova tavola (ripristina i valori di default — annullabile con Undo)" onClick={newBoard}>
          🆕 New
        </button>
        <button title="Apri progetto (.surfcad.json)" onClick={openBoard}>
          📂 Open
        </button>
        <button title="Salva progetto (.surfcad.json)" onClick={saveBoard}>
          💾 Save
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => handleOpenFile(e.target.files)}
        />
        <button title="Importa file .brd (formato legacy BoardCAD-LE) — outline/rocker/deck, non cifrato" onClick={openBrdImport}>
          📥 Importa .brd
        </button>
        <input ref={brdInputRef} type="file" accept=".brd" style={{ display: 'none' }} onChange={(e) => handleBrdFile(e.target.files)} />
        <button title="Importa file .s3d/.s3dx (formato legacy Shape3d) — outline/rocker/deck; nomi tag XML non verificati contro un file reale" onClick={openS3dImport}>
          📥 Importa .s3d
        </button>
        <input ref={s3dInputRef} type="file" accept=".s3d,.s3dx" style={{ display: 'none' }} onChange={(e) => handleS3dFile(e.target.files)} />
        <button title="Importa file .srf (formato legacy SurfCAD) — outline/rocker/deck" onClick={openSrfImport}>
          📥 Importa .srf
        </button>
        <input ref={srfInputRef} type="file" accept=".srf" style={{ display: 'none' }} onChange={(e) => handleSrfFile(e.target.files)} />
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
        <button title="Volume Wizard" onClick={() => setVolumeDialogOpen(true)}>
          🧮 Volume
        </button>
        <button title="Hollow Wood Surfboard — genera costole/spina/telaio bordo per taglio CNC/laser" onClick={() => setHwsDialogOpen(true)}>
          🪵 HWS
        </button>
        <select
          title="Ghost board — sovrapponi una tavola di riferimento"
          value={ghostSelectValue}
          onChange={(e) => {
            const v = e.target.value
            setGhostSelectValue(v)
            if (v === '') setGhostBoard(null)
            else if (v === 'snapshot') setGhostBoard(board)
            else {
              const t = BOARD_TEMPLATES.find((tpl) => tpl.id === v)
              if (t) setGhostBoard(buildBoardFromTemplate(t))
            }
          }}
        >
          <option value="">👻 Ghost: nessuno</option>
          <option value="snapshot">👻 Ghost: snapshot attuale</option>
          {BOARD_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              👻 Ghost: {t.label}
            </option>
          ))}
        </select>
        <div className="sep" />
        <button title="Export STL (mesh 3D)" onClick={exportStl}>
          ⬇️ STL
        </button>
        <button title="Export DXF (outline + profilo, poligonale — massima compatibilità)" onClick={exportDxf}>
          ⬇️ DXF
        </button>
        <button
          title="Export DXF con curve reali (entità SPLINE invece di poligonale approssimata) — richiede software CAD che legge DXF R14+"
          onClick={exportDxfSpline}
        >
          ⬇️ DXF (spline)
        </button>
        <button title="Export G-code (contorno outline)" onClick={exportGcode}>
          ⬇️ G-code
        </button>
        <select
          title="G-code avanzato — profilo template o superficie deck/bottom multi-passata"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exportAdvancedGcode(e.target.value)
            e.target.value = ''
          }}
        >
          <option value="" disabled>
            ⬇️ G-code avanzato…
          </option>
          <option value="profile-rocker">Profilo Rocker (template)</option>
          <option value="profile-deck">Profilo Deck (template)</option>
          <option value="surface-deck">Superficie Deck (multi-passata)</option>
          <option value="surface-bottom">Superficie Bottom (multi-passata)</option>
        </select>
        <button title="Scheda spec/ordine PDF" onClick={() => exportSpecSheetPdf(board)}>
          📄 Spec PDF
        </button>
        <button title="Template 1:1 a tassellatura multi-pagina per ricalco su schiuma" onClick={() => exportPrintSheetPdf(board)}>
          🖨️ Template 1:1
        </button>
        <select
          title="Scheda montaggio pinne — distanze da coda/bordo/centro e dimensioni box, per tagliare le scasse"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exportFinMountingSheet(e.target.value)
            e.target.value = ''
          }}
        >
          <option value="" disabled>
            🦈 Scheda Pinne…
          </option>
          <option value="summary-a4">Riepilogo A4 (con quote)</option>
          <option value="summary-a4-clean">Riepilogo A4 (senza quote)</option>
          <option value="summary-a3">Riepilogo A3 (con quote)</option>
          <option value="summary-a3-clean">Riepilogo A3 (senza quote)</option>
          <option value="template-1-1">Template 1:1 pinne (con quote)</option>
          <option value="template-1-1-clean">Template 1:1 pinne (senza quote)</option>
        </select>
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
                <label>Nome tavola</label>
                <input
                  type="text"
                  value={board.name}
                  onChange={(e) => setBoard((b) => ({ ...b, name: e.target.value }))}
                  onFocus={beginEdit}
                  onBlur={endEdit}
                />
              </div>
              <div className="dims-field">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Lunghezza (cm)</span>
                  <span style={{ color: '#58a6ff', fontSize: 11 }}>
                    {cmToImperialStr(board.length, true)}
                  </span>
                </label>
                <input
                  type="number"
                  value={board.length}
                  onChange={(e) => setDim('length', Number(e.target.value))}
                  onFocus={beginEdit}
                  onBlur={endEdit}
                />
              </div>
              <div className="dims-field">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Larghezza (cm)</span>
                  <span style={{ color: '#58a6ff', fontSize: 11 }}>
                    {cmToImperialStr(board.width, false)}
                  </span>
                </label>
                <input
                  type="number"
                  value={board.width}
                  onChange={(e) => setDim('width', Number(e.target.value))}
                  onFocus={beginEdit}
                  onBlur={endEdit}
                />
              </div>
              <div className="dims-field">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Spessore (cm)</span>
                  <span style={{ color: '#58a6ff', fontSize: 11 }}>
                    {cmToImperialStr(board.thickness, false)}
                  </span>
                </label>
                <input
                  type="number"
                  value={board.thickness}
                  onChange={(e) => setDim('thickness', Number(e.target.value))}
                  onFocus={beginEdit}
                  onBlur={endEdit}
                />
              </div>

              <BoardSpecPanel board={board} ghostBoard={ghostBoard} />
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
        Lunghezza {board.length}cm ({cmToImperialStr(board.length, true)}) · Larghezza {board.width}cm ({cmToImperialStr(board.width, false)}) · Spessore {board.thickness}cm ({cmToImperialStr(board.thickness, false)}) · Coda:{' '}
        {TAIL_LABELS[board.tailShape.type]} — Modifica le curve nei tab, poi vai su 3D View o Quad View per
        vedere il risultato in tempo reale. Il lavoro è salvato automaticamente.
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

      {hwsDialogOpen && <HwsDialog board={board} onClose={() => setHwsDialogOpen(false)} />}

      {volumeDialogOpen && (
        <VolumeWizardDialog
          board={board}
          onApply={(next) => setBoard(() => next)}
          onClose={() => setVolumeDialogOpen(false)}
        />
      )}

      {pendingImport && (
        <div className="modal-backdrop" onClick={() => setPendingImport(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Import {pendingImport.label} — semplificazioni</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              Il file è stato letto, ma alcune parti sono state adattate al modello di questa app:
            </p>
            <ul style={{ fontSize: 13, paddingLeft: 20, margin: '10px 0' }}>
              {pendingImport.warnings.map((w, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {w}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button onClick={() => setPendingImport(null)}>Annulla</button>
              <button className="primary" onClick={confirmPendingImport}>
                Importa comunque
              </button>
            </div>
          </div>
        </div>
      )}

      {fullscreenView && (
        <div className="fullscreen-overlay">
          <div className="fullscreen-overlay-header">
            <span>{FULLSCREEN_LABELS[fullscreenView]}</span>
            <button onClick={() => setFullscreenView(null)}>✕ Esci da schermo intero</button>
          </div>
          <div className="fullscreen-overlay-body">
            {fullscreenView === 'outline' && renderOutlineEditor()}
            {fullscreenView === 'rocker' && renderRockerEditor()}
            {fullscreenView === 'crosssections' && renderCrossSections()}
            {fullscreenView === '3d' && render3D()}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
