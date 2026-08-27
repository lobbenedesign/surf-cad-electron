// Save/Open (.json project files) + localStorage autosave for BoardState.
// BoardState is plain JSON-safe data throughout (curves, cross-sections, fin
// setup, design layers, data-URL reference images), so serialization is just
// JSON with a version envelope; deserialization validates the pieces that are
// structurally load-bearing and back-fills anything missing from the current
// defaultBoard(), so files written by older app versions (before design/
// referenceImages existed) still open instead of crashing the editors.

import { defaultBoard } from './types'
import type { BoardState, CurveCP } from './types'

const FILE_VERSION = 1
const AUTOSAVE_KEY = 'surfcad.autosave.v1'

export function serializeBoard(board: BoardState): string {
  return JSON.stringify({ app: 'SURF-CAD', version: FILE_VERSION, board }, null, 2)
}

function isPoint(p: unknown): p is { x: number; y: number } {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as { x?: unknown }).x === 'number' &&
    Number.isFinite((p as { x: number }).x) &&
    typeof (p as { y?: unknown }).y === 'number' &&
    Number.isFinite((p as { y: number }).y)
  )
}

function isCurveCP(c: unknown): c is CurveCP {
  return Array.isArray(c) && c.length === 4 && c.every(isPoint)
}

/** Outline paths are variable-length (3k+1 for k segments) — a plain CurveCP (k=1) is one valid case, not the only one. */
function isOutlinePath(c: unknown): c is BoardState['outline'] {
  return Array.isArray(c) && c.length >= 4 && (c.length - 1) % 3 === 0 && c.every(isPoint)
}

function isDeckStep(v: unknown): v is NonNullable<BoardState['deckStep']> {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { position?: unknown }).position === 'number' &&
    typeof (v as { height?: unknown }).height === 'number' &&
    typeof (v as { transitionCm?: unknown }).transitionCm === 'number'
  )
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

/**
 * Parses a project file (or autosave blob). Throws with a human-readable
 * message when the structurally required parts are wrong; silently falls back
 * to defaults for optional/newer sections.
 */
export function deserializeBoard(json: string): BoardState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Il file non è un JSON valido.')
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Il file non contiene un progetto SURF-CAD.')

  // Accept both the enveloped format and a bare BoardState (autosave/manual edits).
  const candidate = ((parsed as { board?: unknown }).board ?? parsed) as Record<string, unknown>

  if (!isOutlinePath(candidate.outline)) {
    throw new Error('Il file non contiene una curva outline valida (3k+1 punti di controllo).')
  }
  if (!isCurveCP(candidate.rocker) || !isCurveCP(candidate.deck)) {
    throw new Error('Il file non contiene curve rocker/deck valide (4 punti di controllo ciascuna).')
  }
  if (!isPositiveNumber(candidate.length) || !isPositiveNumber(candidate.width) || !isPositiveNumber(candidate.thickness)) {
    throw new Error('Il file non contiene dimensioni (lunghezza/larghezza/spessore) valide.')
  }

  const base = defaultBoard()
  const crossSections = Array.isArray(candidate.crossSections)
    ? (candidate.crossSections as BoardState['crossSections']).filter(
        (s) => typeof s?.position === 'number' && Array.isArray(s?.points) && s.points.every(isPoint)
      )
    : []

  return {
    ...base,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : base.name,
    length: candidate.length,
    width: candidate.width,
    thickness: candidate.thickness,
    outline: candidate.outline,
    outlineSymmetric: typeof candidate.outlineSymmetric === 'boolean' ? candidate.outlineSymmetric : true,
    outlineOpposite: isOutlinePath(candidate.outlineOpposite) ? candidate.outlineOpposite : undefined,
    rocker: candidate.rocker,
    deck: candidate.deck,
    deckStep: isDeckStep(candidate.deckStep) ? candidate.deckStep : undefined,
    crossSections: crossSections.length >= 2 ? crossSections : base.crossSections,
    tailShape:
      typeof candidate.tailShape === 'object' && candidate.tailShape !== null
        ? { ...base.tailShape, ...(candidate.tailShape as BoardState['tailShape']) }
        : base.tailShape,
    finSetup:
      typeof candidate.finSetup === 'object' &&
      candidate.finSetup !== null &&
      Array.isArray((candidate.finSetup as BoardState['finSetup']).slots)
        ? (candidate.finSetup as BoardState['finSetup'])
        : base.finSetup,
    design:
      typeof candidate.design === 'object' &&
      candidate.design !== null &&
      Array.isArray((candidate.design as BoardState['design']).deck)
        ? (candidate.design as BoardState['design'])
        : base.design,
    referenceImages:
      typeof candidate.referenceImages === 'object' && candidate.referenceImages !== null
        ? (candidate.referenceImages as BoardState['referenceImages'])
        : base.referenceImages
  }
}

/**
 * Best-effort autosave. Reference/design images are data URLs and can exceed the
 * ~5MB localStorage quota — on failure, retry once without the images (the
 * board's geometry is always worth more than a background trace), then give up
 * quietly rather than break editing.
 */
export function saveAutosave(board: BoardState): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeBoard(board))
  } catch {
    try {
      const slim: BoardState = {
        ...board,
        referenceImages: {},
        design: {
          ...board.design,
          deck: board.design.deck.filter((l) => l.type !== 'image' && l.type !== 'pdf'),
          bottom: board.design.bottom.filter((l) => l.type !== 'image' && l.type !== 'pdf')
        }
      }
      localStorage.setItem(AUTOSAVE_KEY, serializeBoard(slim))
    } catch {
      // Quota still exceeded or storage unavailable — skip this autosave.
    }
  }
}

/** Returns the autosaved board, or null when absent/corrupt (corrupt blobs are cleared). */
export function loadAutosave(): BoardState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return deserializeBoard(raw)
  } catch {
    try {
      localStorage.removeItem(AUTOSAVE_KEY)
    } catch {
      // storage unavailable — nothing to clear
    }
    return null
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    // storage unavailable
  }
}
