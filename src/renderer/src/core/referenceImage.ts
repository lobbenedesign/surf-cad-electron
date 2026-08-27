// Reference image (trace-image) for one 2D curve view: a photo or scan positioned
// behind the Outline or Rocker editor so a shaper can digitize an existing board
// by eye. Calibrated by typed length (the simpler of the two methods surveyed in
// roadmap.md §5 — "4-click" calibration is not implemented in this pass) rather
// than a full point-digitizing least-squares fit.

export interface ReferenceImage {
  dataUrl: string
  /** Natural pixel size, used to keep aspect ratio when the user only sets one dimension. */
  naturalWidth: number
  naturalHeight: number
  /** Board-plan cm, top-left corner of the image. */
  x: number
  y: number
  widthCm: number
  heightCm: number
  opacity: number
  mirror: boolean
}

export function referenceImageFromFile(dataUrl: string, naturalWidth: number, naturalHeight: number): ReferenceImage {
  const widthCm = 100
  const heightCm = (naturalHeight / naturalWidth) * widthCm
  return { dataUrl, naturalWidth, naturalHeight, x: 0, y: -heightCm / 2, widthCm, heightCm, opacity: 0.5, mirror: false }
}
