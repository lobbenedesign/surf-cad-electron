// Builds a 3D fin blade (outline + NACA-style foil thickness distribution)
// plus a base tab matching the chosen attachment/box system.

import * as THREE from 'three'
import { catmullRomSample } from './spline'
import { interp } from './bezier'
import type { FinInstance, FoilType } from './finTypes'

const N_SPAN = 28
const N_CHORD = 16

/**
 * Box tab geometry, in cm. Sourced from official installation docs where available
 * (see roadmap.md fin research): FCS I uses twin 19mm round plugs (holesaw spec,
 * appropedia.org/FCSManual.pdf) modeled here as one combined tab footprint; Futures
 * boxes are 3/4" (1.9cm) deep for side positions / 1/2" (1.27cm) for center, with a
 * 6° cant molded into side boxes themselves (foamez.com Future_man-1.pdf); US Box is
 * a standardized 1"x1" (2.54cm) channel taking a 3/8" (0.95cm) fin tang. Lokbox is
 * legacy/approximate — no official spec sheet survives.
 */
export const FIN_BOX_SPECS: Record<
  FinInstance['box'],
  { tabWidth: number; tabDepth: number; tabLength: number; label: string }
> = {
  FCS1: { tabWidth: 1.9, tabDepth: 2.0, tabLength: 4.6, label: 'FCS I (twin plug + screw)' },
  FCS2: { tabWidth: 1.8, tabDepth: 1.9, tabLength: 4.2, label: 'FCS II (tool-less, fig-8)' },
  Futures: { tabWidth: 0.8, tabDepth: 1.9, tabLength: 9.0, label: 'Futures (single blade box, 6° cant built-in)' },
  USBox: { tabWidth: 2.54, tabDepth: 2.54, tabLength: 26.7, label: 'US Box (10.5" adjustable, 1"x1" channel)' },
  Lokbox: { tabWidth: 1.0, tabDepth: 1.8, tabLength: 4.0, label: 'Lokbox (legacy, approximate)' },
  GlassOn: { tabWidth: 0.4, tabDepth: 1.0, tabLength: 0, label: 'Glass-on (no box, fillet joint)' }
}

/** Symmetric NACA 00xx-style thickness distribution, c in [0,1], peak ~0.3 chord. */
function foilProfile(c: number): number {
  const cc = Math.max(0, Math.min(1, c))
  return 0.2969 * Math.sqrt(cc) - 0.126 * cc - 0.3516 * cc * cc + 0.2843 * cc ** 3 - 0.1015 * cc ** 4
}

/** Returns [zPos, zNeg] half-thickness fractions for a foil family at chord fraction c. */
function foilSplit(foil: FoilType, c: number): [number, number] {
  const t = Math.max(foilProfile(c), 0)
  switch (foil) {
    case 'flat':
      return [t * 0.18, -t * 0.18]
    case '50/50':
      return [t, -t]
    case '80/20':
      return [t * 0.2, -t * 0.8]
    case 'inverted':
      return [t * 0.8, -t * 0.2]
    default:
      return [t, -t]
  }
}

/** Builds a lofted 3D blade mesh for one fin, local space: x = chord, y = thickness, z = span (0 = base). */
export function generateFinBladeGeometry(fin: FinInstance): THREE.BufferGeometry {
  const sampled = catmullRomSample(fin.outline, 200)
  let tipIdx = 0
  for (let i = 1; i < sampled.length; i++) if (sampled[i].y > sampled[tipIdx].y) tipIdx = i

  const leading = sampled.slice(0, tipIdx + 1) // base-front -> tip, y ascending
  const trailing = sampled.slice(tipIdx) // tip -> base-back, y descending

  const leadingY = leading.map((p) => p.y)
  const leadingX = leading.map((p) => p.x)
  const trailingYDesc = trailing.map((p) => p.y)
  const trailingX = trailing.map((p) => p.x)
  // resampleOnX/interp expect ascending independent axis
  const trailingYAsc = [...trailingYDesc].reverse()
  const trailingXAsc = [...trailingX].reverse()

  const maxThickness = Math.max(fin.base * 0.045, 0.35)
  const positions: number[] = []

  for (let i = 0; i < N_SPAN; i++) {
    const z = (i / (N_SPAN - 1)) * fin.height
    const xLead = interp(z, leadingY, leadingX)
    const xTrail = interp(z, trailingYAsc, trailingXAsc)
    const chordLen = Math.max(xTrail - xLead, 0.01)
    const spanTaper = 1 - (z / fin.height) * 0.72 // thicker at base, thin near tip

    for (let j = 0; j < N_CHORD; j++) {
      const c = j / (N_CHORD - 1)
      const x = xLead + c * chordLen
      const [zp, zn] = foilSplit(fin.foil, c)
      const half = maxThickness * spanTaper
      // alternate pos/neg surface within the same ring: first half = top (zp), second = bottom (zn) reversed
      const y = j < N_CHORD / 2 ? zp * half : zn * half
      positions.push(x, y, z)
    }
  }

  const indices: number[] = []
  for (let i = 0; i < N_SPAN - 1; i++) {
    for (let j = 0; j < N_CHORD - 1; j++) {
      const a = i * N_CHORD + j
      const b = a + 1
      const c = a + N_CHORD
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Simple box shape for the base tab, sized from FIN_BOX_SPECS. Local space matches the blade's. */
export function generateFinBoxGeometry(fin: FinInstance): THREE.BufferGeometry | null {
  const spec = FIN_BOX_SPECS[fin.box]
  if (spec.tabLength <= 0) return null
  const length = Math.min(spec.tabLength, fin.base * 0.9)
  const box = new THREE.BoxGeometry(length, spec.tabWidth, spec.tabDepth)
  box.translate(fin.base / 2, 0, -spec.tabDepth / 2)
  return box
}
