// Clean-room parser for SurfCAD/SrfCad (.srf) binary board format.
// Written based on field layout specification to ensure GPL-free compliance.
// Converted to centimeters (x100) and mapped to Surf-CAD's coordinate system.

import type { BoardState } from './types'
import { defaultBoard } from './types'
import { knotsToCurveCP, knotsToPath, type LegacyKnot } from './legacyKnots'

export interface SrfImportResult {
  board: BoardState
  warnings: string[]
}

class BinaryReader {
  private view: DataView
  public offset: number = 0

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
  }

  get length(): number {
    return this.view.byteLength
  }

  private ensureBytes(count: number): void {
    if (this.offset + count > this.view.byteLength) {
      throw new Error(`Data truncation: required ${count} bytes at offset ${this.offset}, but only ${this.view.byteLength - this.offset} remain.`)
    }
  }

  readByte(): number {
    this.ensureBytes(1)
    return this.view.getUint8(this.offset++)
  }

  skip(count: number): void {
    this.ensureBytes(count)
    this.offset += count
  }

  readInt16(): number {
    this.ensureBytes(2)
    const val = this.view.getInt16(this.offset, true)
    this.offset += 2
    return val
  }

  readFloat32(): number {
    this.ensureBytes(4)
    const val = this.view.getFloat32(this.offset, true)
    this.offset += 4
    return val
  }

  readTerminatedString(sentinel: number): string {
    const chars: number[] = []
    while (this.offset < this.view.byteLength) {
      const b = this.readByte()
      if (b === sentinel) break
      chars.push(b)
    }
    return String.fromCharCode(...chars)
  }
}

function parseKnot(reader: BinaryReader): LegacyKnot {
  // End point (x, y, z in meters)
  const ex = reader.readFloat32() * 100
  const ey = reader.readFloat32() * 100
  reader.readFloat32() // Skip z
  reader.skip(12)      // Skip empty space

  // Tangent to previous point
  const px = reader.readFloat32() * 100
  const py = reader.readFloat32() * 100
  reader.readFloat32() // Skip z

  // Tangent to next point
  const nx = reader.readFloat32() * 100
  const ny = reader.readFloat32() * 100
  reader.readFloat32() // Skip z

  reader.skip(28)      // Skip inter-knot space

  return {
    anchor: { x: ex, y: ey },
    handleIn: { x: px, y: py },
    handleOut: { x: nx, y: ny }
  }
}

function readKnotList(reader: BinaryReader, count: number): LegacyKnot[] {
  const list: LegacyKnot[] = []
  for (let i = 0; i < count; i++) {
    list.push(parseKnot(reader))
  }
  return list
}

export function parseSrfFile(buffer: ArrayBuffer): SrfImportResult {
  if (buffer.byteLength === 0) {
    throw new Error('Il file .srf è vuoto (0 byte).')
  }

  const reader = new BinaryReader(buffer)

  // 1. Read header strings
  reader.readTerminatedString(0x20) // Skip version string (space-terminated)
  const rawName = reader.readTerminatedString(0x2a) // Asterisk-terminated name
  const name = (rawName.length > 0 ? rawName.slice(0, -1) : rawName) || 'Tavola importata (.srf)'
  reader.readTerminatedString(0x40) // Skip comments (at-terminated)

  // 2. Skip to dimensions
  reader.skip(11)
  const lengthCm = reader.readFloat32() * 100

  if (!Number.isFinite(lengthCm) || lengthCm <= 0) {
    throw new Error(`Lunghezza tavola non valida nel file .srf: ${lengthCm / 100} m`)
  }

  // Skip other seed measurements (initial splines, widepoint position, rocker/rail/thickness guides)
  // 4 floats for outline, 1 for widepoint, 4 for rocker, 4 for rail, 4 for thickness -> 17 floats
  reader.skip(17 * 4)
  reader.skip(113) // Additional header padding

  const warnings: string[] = []
  const base = defaultBoard()

  // 3. Read Outline spline
  const nOutline = reader.readInt16()
  if (nOutline < 2) {
    throw new Error(`Il file .srf deve contenere almeno 2 punti di controllo per l'outline (trovati: ${nOutline})`)
  }
  const outlineKnots = readKnotList(reader, nOutline)
  const outline = knotsToPath(outlineKnots)

  // 4. Read Rocker spline
  reader.skip(1)
  const nRocker = reader.readInt16()
  if (nRocker < 2) {
    throw new Error(`Il file .srf deve contenere almeno 2 punti di controllo per il rocker (trovati: ${nRocker})`)
  }
  const rockerKnots = readKnotList(reader, nRocker)
  const rocker = knotsToCurveCP(rockerKnots, 'Rocker', base.rocker, warnings)

  // 5. Read Rail spline (consumed and discarded, not used by current editor)
  reader.skip(1)
  const nRail = reader.readInt16()
  readKnotList(reader, nRail)

  // 6. Read Deck spline
  reader.skip(1)
  const nDeck = reader.readInt16()
  if (nDeck < 2) {
    throw new Error(`Il file .srf deve contenere almeno 2 punti di controllo per il deck (trovati: ${nDeck})`)
  }
  const deckKnots = readKnotList(reader, nDeck)
  const deck = knotsToCurveCP(deckKnots, 'Deck', base.deck, warnings)

  // 7. Read Bottom spline (consumed and discarded)
  reader.skip(1)
  const nBottom = reader.readInt16()
  readKnotList(reader, nBottom)

  // Skip parsing caves/cross-sections and use default rail templates
  warnings.push("Sezioni trasversali e setup pinne sono stati impostati ai valori di default.")

  // Compute maximum width from outline
  let maxWidth = base.width
  if (outline.length > 0) {
    maxWidth = Math.max(...outline.map((p) => p.y)) * 2
  }

  // Compute thickness at center from rocker and deck curves if possible
  let maxThickness = base.thickness
  if (rocker.length === 4 && deck.length === 4) {
    const midRockerY = rocker[1].y // approximate center
    const midDeckY = deck[1].y
    maxThickness = Math.abs(midDeckY - midRockerY)
  }

  const board: BoardState = {
    ...base,
    name,
    length: Math.round(lengthCm),
    width: Math.round(maxWidth || base.width),
    thickness: Math.round(maxThickness || base.thickness),
    outline,
    outlineSymmetric: true,
    outlineOpposite: undefined,
    rocker,
    deck
  }

  return { board, warnings }
}
