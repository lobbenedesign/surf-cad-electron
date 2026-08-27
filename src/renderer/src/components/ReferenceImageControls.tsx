import { useRef } from 'react'
import { referenceImageFromFile } from '../core/referenceImage'
import type { ReferenceImage } from '../core/referenceImage'

interface ReferenceImageControlsProps {
  image: ReferenceImage | null | undefined
  onChange: (image: ReferenceImage | null) => void
}

export function ReferenceImageControls({ image, onChange }: ReferenceImageControlsProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => onChange(referenceImageFromFile(dataUrl, img.naturalWidth, img.naturalHeight))
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="ref-image-bar">
      <button onClick={() => fileInputRef.current?.click()}>🖼️ {image ? 'Cambia immagine' : 'Carica immagine di riferimento'}</button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      {image && (
        <>
          <label>
            Opacità
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={image.opacity}
              onChange={(e) => onChange({ ...image, opacity: Number(e.target.value) })}
            />
          </label>
          <label>
            Larghezza (cm)
            <input
              type="number"
              value={image.widthCm}
              onChange={(e) => {
                const widthCm = Number(e.target.value)
                const heightCm = (image.naturalHeight / image.naturalWidth) * widthCm
                onChange({ ...image, widthCm, heightCm })
              }}
            />
          </label>
          <label>
            X (cm)
            <input type="number" value={image.x} onChange={(e) => onChange({ ...image, x: Number(e.target.value) })} />
          </label>
          <label>
            Y (cm)
            <input type="number" value={image.y} onChange={(e) => onChange({ ...image, y: Number(e.target.value) })} />
          </label>
          <label className="ref-image-checkbox">
            <input type="checkbox" checked={image.mirror} onChange={(e) => onChange({ ...image, mirror: e.target.checked })} />
            Specchia
          </label>
          <button onClick={() => onChange(null)}>✕ Rimuovi</button>
        </>
      )}
    </div>
  )
}
