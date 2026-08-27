// Deck step: an abrupt-but-smoothed rise in deck height starting at a given
// station and holding through the tail — the "step deck" common on modern
// performance shortboards (extra tail lift/release), distinct from the smooth
// continuous Rocker & Thickness bezier curve which can't represent a true
// discontinuity. Optional (`BoardState.deckStep` is undefined by default —
// existing boards/save files are unaffected until a user adds one).
//
// Best-effort feature scoping note: this is this app's own interpretation of
// the "rail band / cutout step" comparison-doc suggestion — the referenced
// project's actual algorithm couldn't be used as a spec (GPL source, not
// something we can read for implementation purposes), so this is an
// independently-designed feature solving the same real shaping need (a real,
// nameable modern-shortboard construction detail), not a port of anything.

export interface DeckStep {
  /** 0..1 fraction of board length from the nose where the step reaches full height. */
  position: number
  /** Additional deck elevation from `position` to the tail, cm. */
  height: number
  /** Length of the smooth ramp immediately before `position`, cm — avoids a true (infinite-slope) discontinuity while still reading as a visible step at real scale. */
  transitionCm: number
}

export function defaultDeckStep(): DeckStep {
  return { position: 0.85, height: 0.8, transitionCm: 15 }
}

/**
 * Additional deck-height offset at longitudinal position `x` (cm from nose),
 * smoothstepped from 0 up to `step.height` over the `transitionCm` window
 * immediately before `step.position * length`, then held flat through the
 * tail. Returns 0 if `step` is undefined (the common case — no step).
 */
export function deckStepOffsetAt(step: DeckStep | undefined, x: number, length: number): number {
  if (!step) return 0
  const stepX = step.position * length
  const rampStart = stepX - step.transitionCm
  if (x <= rampStart) return 0
  if (x >= stepX) return step.height
  const t = (x - rampStart) / Math.max(step.transitionCm, 1e-6)
  const smooth = t * t * (3 - 2 * t)
  return step.height * smooth
}
