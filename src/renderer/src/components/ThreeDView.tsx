import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { generateBoardGeometry } from '../core/meshGenerator'
import { generateFinBladeGeometry, generateFinBoxGeometry } from '../core/finGeometry'
import { finSlotMountPosition } from '../core/finTypes'
import { evaluateCurve, resampleOnX } from '../core/bezier'
import type { BoardState, CurveCP } from '../core/types'

interface ThreeDViewProps {
  board: BoardState
}

export function ThreeDView({ board }: ThreeDViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    mesh: THREE.Mesh
    wireframe: THREE.LineSegments
    finsGroup: THREE.Group
  } | null>(null)

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
    const material = new THREE.MeshStandardMaterial({
      color: 0xdedad0,
      side: THREE.DoubleSide,
      flatShading: false,
      roughness: 0.55,
      metalness: 0.05
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x007aff, transparent: true, opacity: 0.15 })
    )
    scene.add(wireframe)

    const finsGroup = new THREE.Group()
    scene.add(finsGroup)

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

    stateRef.current = { renderer, scene, camera, controls, mesh, wireframe, finsGroup }

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
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
  }, [board])

  // Rebuild + position fins whenever the fin setup or rocker curve changes
  useEffect(() => {
    const s = stateRef.current
    if (!s) return

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
    const outlineCurve = evaluateCurve(...(board.outline as CurveCP), 200)
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x8fd3e8, side: THREE.DoubleSide, roughness: 0.35 })
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 })

    // Fins never float off the rail: the lateral position is resolved from the
    // board's actual half-width at this station minus the rail inset, not a
    // fixed absolute offset (which would only be correct for one specific
    // board width/outline) — see finSlotMountPosition.
    const halfWidthAtX = (x: number): number => resampleOnX(outlineCurve, [x])[0]

    board.finSetup.slots.forEach((slot) => {
      const group = new THREE.Group()

      const blade = new THREE.Mesh(generateFinBladeGeometry(slot.fin), bladeMaterial)
      group.add(blade)
      const boxGeom = generateFinBoxGeometry(slot.fin)
      if (boxGeom) group.add(new THREE.Mesh(boxGeom, boxMaterial))

      // local space: x=chord (fore/aft), y=thickness, z=span (0=base -> height=tip)
      group.rotation.x = Math.PI // point span downward from the board bottom
      group.rotateX(THREE.MathUtils.degToRad(slot.fin.cant))
      group.rotateZ(THREE.MathUtils.degToRad(slot.fin.toe))

      const { x: mountX, y: mountY } = finSlotMountPosition(slot, board.length, halfWidthAtX)
      const mountZ = resampleOnX(rockerCurve, [mountX])[0]
      group.position.set(mountX, mountY, mountZ)

      s.finsGroup.add(group)
    })
  }, [board])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
