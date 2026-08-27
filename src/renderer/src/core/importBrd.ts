// Reader for the legacy BoardCAD-LE native `.brd` text format (clean-room —
// written from the plain-language field layout below, not from any GPL'd
// source; see roadmap.md §5 and memory for the research this is based on).
//
// `.brd` is a line-oriented key/value file: scalar metadata lines `pNN : value`
// (units cm), plus geometry fields carrying bezier knot records:
//   - p1 length, p3 thickness, p4 width, p8 name (scalar metadata used here;
//     many other pNN fields exist but aren't needed for our geometry import)
//   - p32 outline (half-width vs length — matches our own half-width convention)
//   - p33 bottom/rocker curve, p34 deck curve
//   - p35 cross-section groups — not imported (see below)
// Each knot is a record `(cp [endX,endY,prevX,prevY,nextX,nextY] <cont> <other>)`:
// an anchor point plus its incoming ("prev") and outgoing ("next") tangent
// handles, matching a chain of cubic-bezier segments exactly like our own
// OutlinePath (anchor, handleOut, handleIn, anchor, handleOut, handleIn, ...).
//
// Scope, deliberately: cross-sections (p35) are skipped — the legacy format's
// per-station profile is an absolute-coordinate spline, while ours is a
// normalized (u,v) rail-shape independent of any one board's dimensions
// (see core/crossSection.ts); converting one into the other station-by-station
// isn't done here, imported boards get the app's default rail shape instead —
// the same simplification the 5 built-in templates already make (see
// core/boardTemplates.ts). Fin setup is likewise not reconstructed from the
// legacy free-text fin field; imported boards get a default thruster setup.
// Encrypted `.brd` files (legacy `%BRD-1.01`/`%BRD-1.02` header — a
// password-based DES cipher, pure obfuscation not a real security boundary)
// are detected and rejected with a clear message rather than decrypted.

import { defaultBoard } from './types'
import type { BoardState } from './types'
import { knotsToCurveCP, knotsToPath, type LegacyKnot } from './legacyKnots'
import { isEncryptedBrd, decryptBrd } from './legacyCrypto'

export interface BrdImportResult {
  board: BoardState
  /** Non-fatal simplifications made during import (e.g. a multi-point rocker/deck curve reduced to one bezier segment) — surfaced to the user before committing the import. */
  warnings: string[]
}

const CP_RECORD = /\(cp\s*\[([^\]]+)\]\s*(?:true|false)\s+(?:true|false)\s*\)/gi

/** Splits the file into `pNN -> raw value text` (value = everything up to the next `pMM :` marker), tolerant of values that span multiple lines. */
function splitFields(text: string): Map<number, string> {
  const markers: { num: number; colonAt: number; start: number }[] = []
  const markerRe = /(?:^|\n)[ \t]*p(\d+)[ \t]*:/g
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(text))) {
    markers.push({ num: Number(m[1]), colonAt: m.index + m[0].length, start: m.index })
  }
  const fields = new Map<number, string>()
  for (let i = 0; i < markers.length; i++) {
    const end = i + 1 < markers.length ? markers[i + 1].start : text.length
    fields.set(markers[i].num, text.slice(markers[i].colonAt, end).trim())
  }
  return fields
}

function extractKnots(raw: string | undefined): LegacyKnot[] {
  if (!raw) return []
  const knots: LegacyKnot[] = []
  CP_RECORD.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CP_RECORD.exec(raw))) {
    const nums = m[1].split(',').map((s) => Number(s.trim()))
    if (nums.length < 6 || nums.some((n) => !Number.isFinite(n))) continue
    knots.push({
      anchor: { x: nums[0], y: nums[1] },
      handleIn: { x: nums[2], y: nums[3] },
      handleOut: { x: nums[4], y: nums[5] }
    })
  }
  return knots
}

/** Parses a `.brd` file's text content into a BoardState. Throws on genuinely unusable input (encrypted file, missing/invalid outline); returns non-fatal simplification warnings alongside the result otherwise. */
export function parseBrdFile(text: string): BrdImportResult {
  if (isEncryptedBrd(text)) {
    try {
      text = decryptBrd(text)
    } catch (err) {
      throw new Error(`Impossibile decrittografare il file .brd cifrato: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const fields = splitFields(text)
  const warnings: string[] = []
  const base = defaultBoard()

  const getNum = (n: number, fallback: number): number => {
    const raw = fields.get(n)
    const v = raw !== undefined ? Number(raw) : NaN
    return Number.isFinite(v) ? v : fallback
  }
  const getStr = (n: number): string | undefined => {
    const raw = fields.get(n)
    return raw ? raw.replace(/^["']|["']$/g, '') : undefined
  }

  const length = getNum(1, base.length)
  const width = getNum(4, base.width)
  const thickness = getNum(3, base.thickness)
  const name = getStr(8) ?? 'Tavola importata (.brd)'

  const outlineKnots = extractKnots(fields.get(32))
  if (outlineKnots.length < 2) {
    throw new Error('Il file .brd non contiene una curva outline valida (servono almeno 2 punti di controllo nel campo p32).')
  }
  const outline = knotsToPath(outlineKnots)

  const rocker = knotsToCurveCP(extractKnots(fields.get(33)), 'Rocker', base.rocker, warnings)
  const deck = knotsToCurveCP(extractKnots(fields.get(34)), 'Deck', base.deck, warnings)

  warnings.push('Sezioni trasversali e setup pinne non sono ricostruiti dal file legacy — impostati ai valori di default (come per i template built-in).')

  const board: BoardState = {
    ...base,
    name,
    length,
    width,
    thickness,
    outline,
    outlineSymmetric: true,
    outlineOpposite: undefined,
    rocker,
    deck
  }

  return { board, warnings }
}
