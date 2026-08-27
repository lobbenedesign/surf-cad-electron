import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { generateBoardGeometry } from '../core/meshGenerator'
import { generateFinBladeGeometry, generateFinBoxGeometry } from '../core/finGeometry'
import { finSlotMountPosition, updateFinPosition } from '../core/finTypes'
import { evaluateCurve, evaluatePath, resampleOnX } from '../core/bezier'
import { layersFor, renderDesignCanvas } from '../core/design'
import type { BoardState, CurveCP } from '../core/types'
import type { FinSetup } from '../core/finTypes'
import type { DesignSurface } from '../core/design'

interface ThreeDViewProps {
  board: BoardState
  selectedFinId?: string | null
  onSelectFin?: (id: string) => void
  onFinSetupChange?: (setup: FinSetup) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function ThreeDView({
  board,
  selectedFinId = null,
  onSelectFin,
  onFinSetupChange,
  onDragStart,
  onDragEnd
}: ThreeDViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    transformControls: TransformControls
    mesh: THREE.Mesh
    deckMaterial: THREE.MeshStandardMaterial
    bottomMaterial: THREE.MeshStandardMaterial
    designImageCache: Map<string, HTMLImageElement>
    designPdfCache: Map<string, HTMLCanvasElement>
    designPdfPending: Set<string>
    wireframe: THREE.LineSegments
    finsGroup: THREE.Group
    finGroupsById: Map<string, THREE.Group>
    raycaster: THREE.Raycaster
  } | null>(null)
  const boardRef = useRef(board)
  boardRef.current = board
  const selectedFinIdRef = useRef(selectedFinId)
  selectedFinIdRef.current = selectedFinId
  const onSelectFinRef = useRef(onSelectFin)
  onSelectFinRef.current = onSelectFin
  const onFinSetupChangeRef = useRef(onFinSetupChange)
  onFinSetupChangeRef.current = onFinSetupChange
  const onDragStartRef = useRef(onDragStart)
  onDragStartRef.current = onDragStart
  const onDragEndRef = useRef(onDragEnd)
  onDragEndRef.current = onDragEnd

  // Renders each surface's design layers (§6) onto a canvas and applies it as that
  // material's texture. `renderDesignCanvas` may not have every image ready yet
  // (they load async) — its `onImageLoad` callback re-invokes this so the texture
  // catches up once loading finishes, without needing a React re-render to do it.
  const applyDesignTextures = (
    s: NonNullable<typeof stateRef.current>,
    b: BoardState
  ): void => {
    const buildTexture = (surface: DesignSurface, material: THREE.MeshStandardMaterial): void => {
      const layers = layersFor(b.design, surface)
      material.map?.dispose()
      if (layers.length === 0) {
        // No design on this surface — leave it plain instead of multiplying the
        // base color by the design canvas's opaque black backdrop (which would
        // otherwise render the whole board almost black).
        material.map = null
        material.needsUpdate = true
        return
      }
      const canvas = renderDesignCanvas(
        layers,
        b.length,
        b.width,
        s.designImageCache,
        () => {
          const latest = stateRef.current
          if (latest) applyDesignTextures(latest, boardRef.current)
        },
        '#ffffff',
        s.designPdfCache,
        s.designPdfPending
      )
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      material.map = texture
      material.needsUpdate = true
    }
    buildTexture('deck', s.deckMaterial)
    buildTexture('bottom', s.bottomMaterial)
  }

  // Init scene once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2b2b2b)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
    camera.position.set(160, -220, 140)
    camera.up.set(0, 0, 1)
    camera.lookAt(100, 0, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(100, 0, 5)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(100, -200, 300)
    scene.add(dir)
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3)
    dir2.position.set(-100, 200, -100)
    scene.add(dir2)

    const grid = new THREE.GridHelper(400, 40, 0x555555, 0x3a3a3a)
    grid.rotation.x = Math.PI / 2
    scene.add(grid)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    // Two materials (deck/bottom), indexed by the geometry's two groups
    // (`generateBoardGeometry` splits faces by cross-section v — see meshGenerator.ts)
    // so each surface can carry its own design texture (§6).
    const materialOpts = { color: 0xdedad0, side: THREE.DoubleSide, flatShading: false, roughness: 0.55, metalness: 0.05 }
    const deckMaterial = new THREE.MeshStandardMaterial(materialOpts)
    const bottomMaterial = new THREE.MeshStandardMaterial(materialOpts)
    const mesh = new THREE.Mesh(geometry, [deckMaterial, bottomMaterial])
    scene.add(mesh)

    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x007aff, transparent: true, opacity: 0.15 })
    )
    scene.add(wireframe)

    const finsGroup = new THREE.Group()
    scene.add(finsGroup)

    // 3D fin manipulator: TransformControls gizmo, translate-only, constrained to
    // X (fore/aft) and Y (lateral) — Z (height) is always resolved from the
    // rocker curve, not user-draggable, so the fin can't be pulled through the
    // hull. World space (not local) so dragging maps directly onto mountX/mountY
    // regardless of the fin's own cant/toe rotation.
    const transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.setMode('translate')
    transformControls.setSpace('world')
    transformControls.showZ = false
    transformControls.size = 0.9
    scene.add(transformControls.getHelper?.() ?? (transformControls as unknown as THREE.Object3D))

    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
      if (event.value) onDragStartRef.current?.()
      else onDragEndRef.current?.()
    })

    transformControls.addEventListener('objectChange', () => {
      const target = transformControls.object
      const slotId = selectedFinIdRef.current
      const s = stateRef.current
      if (!target || !slotId || !s || !onFinSetupChangeRef.current) return
      const b = boardRef.current
      const outlineCurveRight = evaluatePath(b.outline, 200)
      const outlineCurveLeft = b.outlineSymmetric ? outlineCurveRight : evaluatePath(b.outlineOpposite ?? b.outline, 200)
      const existingSide = Math.sign(b.finSetup.slots.find((sl) => sl.id === slotId)?.railInset ?? 1) || 1
      const mountX = THREE.MathUtils.clamp(target.position.x, 0, b.length)
      const provisionalSide = Math.sign(target.position.y) || existingSide
      const halfWidth = Math.max(resampleOnX(provisionalSide < 0 ? outlineCurveLeft : outlineCurveRight, [mountX])[0], 0.01)
      const y = THREE.MathUtils.clamp(target.position.y, -halfWidth, halfWidth)
      const side = Math.sign(y) || existingSide
      const railInset = side * Math.max(halfWidth - Math.abs(y), 0.1)
      onFinSetupChangeRef.current(updateFinPosition(b.finSetup, slotId, { distFromTail: b.length - mountX, railInset }))
    })

    const raycaster = new THREE.Raycaster()
    const onCanvasClick = (event: MouseEvent): void => {
      const s = stateRef.current
      if (!s || transformControls.dragging) return
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(s.finsGroup.children, true)
      if (hits.length === 0) return
      let obj: THREE.Object3D | null = hits[0].object
      while (obj && !obj.userData.slotId) obj = obj.parent
      if (obj && obj.userData.slotId) onSelectFinRef.current?.(obj.userData.slotId as string)
    }
    renderer.domElement.addEventListener('click', onCanvasClick)

    let frameId: number
    const animate = (): void => {
      controls.update()
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    const resize = (): void => {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    stateRef.current = {
      renderer,
      scene,
      camera,
      controls,
      transformControls,
      mesh,
      deckMaterial,
      bottomMaterial,
      designImageCache: new Map(),
      designPdfCache: new Map(),
      designPdfPending: new Set(),
      wireframe,
      finsGroup,
      finGroupsById: new Map(),
      raycaster
    }

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      renderer.domElement.removeEventListener('click', onCanvasClick)
      transformControls.dispose()
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Rebuild mesh geometry whenever the board curves change
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    const newGeometry = generateBoardGeometry(board)
    s.mesh.geometry.dispose()
    s.mesh.geometry = newGeometry
    s.wireframe.geometry.dispose()
    s.wireframe.geometry = new THREE.WireframeGeometry(newGeometry)
    applyDesignTextures(s, board)
  }, [board])

  // Rebuild + position fins whenever the fin setup or rocker curve changes
  useEffect(() => {
    const s = stateRef.current
    if (!s) return

    s.transformControls.detach()
    s.finGroupsById.clear()
    while (s.finsGroup.children.length > 0) {
      const child = s.finsGroup.children[0] as THREE.Group
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
        }
      })
      s.finsGroup.remove(child)
    }

    const rockerCurve = evaluateCurve(...(board.rocker as CurveCP), 200)
    const outlineCurveRight = evaluatePath(board.outline, 200)
    const outlineCurveLeft = board.outlineSymmetric ? outlineCurveRight : evaluatePath(board.outlineOpposite ?? board.outline, 200)
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x8fd3e8, side: THREE.DoubleSide, roughness: 0.35 })
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 })

    // Fins never float off the rail: the lateral position is resolved from the
    // board's actual half-width at this station minus the rail inset, not a
    // fixed absolute offset (which would only be correct for one specific
    // board width/outline) — see finSlotMountPosition. `side` picks the right
    // or left rail's own width when the outline is asymmetric.
    const halfWidthAtX = (x: number, side: number = 1): number =>
      resampleOnX(side < 0 ? outlineCurveLeft : outlineCurveRight, [x])[0]

    board.finSetup.slots.forEach((slot) => {
      const group = new THREE.Group()
      group.userData.slotId = slot.id

      const isSelected = slot.id === selectedFinIdRef.current
      const blade = new THREE.Mesh(
        generateFinBladeGeometry(slot.fin),
        isSelected ? bladeMaterial.clone() : bladeMaterial
      )
      if (isSelected) (blade.material as THREE.MeshStandardMaterial).emissive.setHex(0x553300)
      group.add(blade)
      const boxGeom = generateFinBoxGeometry(slot.fin)
      if (boxGeom) group.add(new THREE.Mesh(boxGeom, boxMaterial))

      // local space: x=chord (fore/aft), y=thickness, z=span (0=base -> height=tip)
      group.rotation.x = Math.PI // point span downward from the board bottom
      group.rotateX(THREE.MathUtils.degToRad(slot.fin.cant))
      group.rotateZ(THREE.MathUtils.degToRad(slot.fin.toe))

      const finSide = Math.sign(slot.railInset) || 1
      const { x: mountX, y: mountY } = finSlotMountPosition(slot, board.length, (x) => halfWidthAtX(x, finSide))
      const mountZ = resampleOnX(rockerCurve, [mountX])[0]
      group.position.set(mountX, mountY, mountZ)

      s.finsGroup.add(group)
      s.finGroupsById.set(slot.id, group)
    })

    if (selectedFinIdRef.current) {
      const selectedGroup = s.finGroupsById.get(selectedFinIdRef.current)
      if (selectedGroup) s.transformControls.attach(selectedGroup)
    }
  }, [board])

  // Re-attach the gizmo when the selection changes without a fin rebuild
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    if (selectedFinId) {
      const group = s.finGroupsById.get(selectedFinId)
      if (group) s.transformControls.attach(group)
    } else {
      s.transformControls.detach()
    }
  }, [selectedFinId])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
