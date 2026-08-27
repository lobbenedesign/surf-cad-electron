// Reader for the Shape3d `.s3d`/`.s3dx` XML board format (clean-room — written
// from the plain-language field layout below, not from any GPL'd source).
//
// Format: an XML document with a `Board` element (root, or nested — this
// reader searches by tag name rather than assuming a fixed path) holding
// three named spline groups — Outline, Bottom, Deck — each with three
// parallel 3-D point lists: Control_points / Tangents_1 / Tangents_2, each a
// list of Point3d elements with x/y/z children. Index 0 of each list is a
// symmetry marker and is discarded; real knots start at index 1. Each 2-D
// curve is a planar projection of the 3-D points: Outline uses XY, Bottom and
// Deck use XZ. Cross-sections aren't imported — see the scoping note below.
// Units are centimeters (no conversion applied).
//
// XXE mitigation: rejects any input containing a `<!DOCTYPE` or `<!ENTITY`
// declaration *before* handing it to the parser, and uses the browser's
// native `DOMParser` (which, unlike a libxml-based parser, does not fetch or
// resolve external entities by default) rather than a hand-rolled tag
// extractor — a different, standards-based strategy for the same concern
// flagged in roadmap.md/BoardCAD-LE's own format assessment.
//
// Caveat: the exact XML element names above are inferred from documented
// projection math, not verified against a real Shape3d-exported file (none
// was available to test against this session) — if a genuine `.s3d`/`.s3dx`
// file fails to import, the element names it actually uses may differ from
// what this reader looks for.

import type { Point } from './bezier'
import { defaultBoard } from './types'
import type { BoardState } from './types'
import { knotsToCurveCP, knotsToPath, type LegacyKnot } from './legacyKnots'

export interface S3dImportResult {
  board: BoardState
  warnings: string[]
}

function assertNoXxeRisk(text: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error(
      'Il file XML contiene una dichiarazione DOCTYPE/ENTITY — non supportata per motivi di sicurezza (rischio XXE). Rimuovila e riprova se sei certo che il file sia sicuro.'
    )
  }
}

function firstByTag(root: Element, candidates: string[]): Element | null {
  for (const name of candidates) {
    const found = root.getElementsByTagName(name)[0]
    if (found) return found
  }
  return null
}

interface Point3d {
  x: number
  y: number
  z: number
}

function readPoint3dList(container: Element | null): Point3d[] {
  if (!container) return []
  return Array.from(container.getElementsByTagName('Point3d')).map((p) => ({
    x: Number(p.getElementsByTagName('x')[0]?.textContent ?? '0'),
    y: Number(p.getElementsByTagName('y')[0]?.textContent ?? '0'),
    z: Number(p.getElementsByTagName('z')[0]?.textContent ?? '0')
  }))
}

/** Reads a spline group's three parallel Point3d lists into knots, discarding index 0 (symmetry marker) and projecting each 3D point onto the curve's own 2D plane. */
function readKnots(splineEl: Element | null, project: (p: Point3d) => Point): LegacyKnot[] {
  if (!splineEl) return []
  const ctrl = readPoint3dList(firstByTag(splineEl, ['Control_points']))
  const t1 = readPoint3dList(firstByTag(splineEl, ['Tangents_1']))
  const t2 = readPoint3dList(firstByTag(splineEl, ['Tangents_2']))
  const n = Math.min(ctrl.length, t1.length, t2.length)
  const knots: LegacyKnot[] = []
  for (let i = 1; i < n; i++) {
    knots.push({ anchor: project(ctrl[i]), handleIn: project(t1[i]), handleOut: project(t2[i]) })
  }
  return knots
}

/** Parses a `.s3d`/`.s3dx` file's text content into a BoardState. Throws on genuinely unusable input (XXE risk, invalid XML, missing/invalid outline); returns non-fatal simplification warnings alongside the result otherwise. */
export function parseS3dFile(text: string): S3dImportResult {
  assertNoXxeRisk(text)

  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Il file non è un XML valido.')
  }

  const root = doc.documentElement
  const boardEl = firstByTag(root, ['Board', 'board']) ?? (root.tagName?.toLowerCase() === 'board' ? root : null)
  if (!boardEl) {
    throw new Error('Il file non contiene un elemento <Board> — non sembra un file Shape3d .s3d/.s3dx valido.')
  }

  const warnings: string[] = []
  const base = defaultBoard()

  const getNum = (tags: string[], fallback: number): number => {
    const raw = firstByTag(boardEl, tags)?.textContent?.trim()
    const v = raw ? Number(raw) : NaN
    return Number.isFinite(v) ? v : fallback
  }
  const getStr = (tags: string[]): string | undefined => firstByTag(boardEl, tags)?.textContent?.trim() || undefined

  const length = getNum(['Length', 'length'], base.length)
  const width = getNum(['Width', 'width'], base.width)
  const thickness = getNum(['Thickness', 'thickness'], base.thickness)
  const name = getStr(['Model', 'model', 'Name', 'name']) ?? 'Tavola importata (.s3d)'

  const outlineEl = firstByTag(boardEl, ['Outline', 'outline'])
  const bottomEl = firstByTag(boardEl, ['Bottom', 'bottom'])
  const deckEl = firstByTag(boardEl, ['Deck', 'deck'])

  const outlineKnots = readKnots(outlineEl, (p) => ({ x: p.x, y: p.y })) // XY plane
  if (outlineKnots.length < 2) {
    throw new Error(
      'Il file .s3d/.s3dx non contiene una curva Outline valida (servono almeno 2 punti in <Outline><Control_points>). Se questo è un file Shape3d autentico e l\'import continua a fallire, i nomi degli elementi XML potrebbero differire da quelli previsti da questo importer (mai verificato contro un file reale).'
    )
  }
  const outline = knotsToPath(outlineKnots)

  const rocker = knotsToCurveCP(readKnots(bottomEl, (p) => ({ x: p.x, y: p.z })), 'Rocker', base.rocker, warnings) // XZ plane
  const deck = knotsToCurveCP(readKnots(deckEl, (p) => ({ x: p.x, y: p.z })), 'Deck', base.deck, warnings) // XZ plane

  warnings.push('Sezioni trasversali e setup pinne non sono ricostruiti dal file legacy — impostati ai valori di default (come per i template built-in).')
  warnings.push(
    'Formato .s3d/.s3dx: i nomi degli elementi XML usati da questo importer non sono stati verificati contro un file Shape3d reale (nessun file di esempio disponibile) — controlla che la forma importata corrisponda a quella attesa.'
  )

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
