import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { generateFinBladeGeometry, generateFinBoxGeometry } from '../core/finGeometry'
import type { FinInstance } from '../core/finTypes'

interface FinPreview3DProps {
  fin: FinInstance
}

export function FinPreview3D({ fin }: FinPreview3DProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    blade: THREE.Mesh
    box: THREE.Mesh | null
  } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2b2b2b)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    camera.position.set(14, -14, 10)
    camera.up.set(0, 0, 1)
    camera.lookAt(0, 0, 6)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 6)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(10, -10, 20)
    scene.add(dir)

    const grid = new THREE.GridHelper(30, 15, 0x555555, 0x3a3a3a)
    grid.rotation.x = Math.PI / 2
    scene.add(grid)

    const bladeGeom = new THREE.BufferGeometry()
    bladeGeom.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    const material = new THREE.MeshStandardMaterial({
      color: 0x8fd3e8,
      side: THREE.DoubleSide,
      roughness: 0.35,
      metalness: 0.05
    })
    const blade = new THREE.Mesh(bladeGeom, material)
    scene.add(blade)

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

    stateRef.current = { renderer, scene, camera, controls, blade, box: null }

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return

    const bladeGeom = generateFinBladeGeometry(fin)
    s.blade.geometry.dispose()
    s.blade.geometry = bladeGeom

    if (s.box) {
      s.scene.remove(s.box)
      s.box.geometry.dispose()
      s.box = null
    }
    const boxGeom = generateFinBoxGeometry(fin)
    if (boxGeom) {
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6 })
      const boxMesh = new THREE.Mesh(boxGeom, boxMat)
      s.scene.add(boxMesh)
      s.box = boxMesh
    }
  }, [fin])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
