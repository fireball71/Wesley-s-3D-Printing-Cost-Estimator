"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader"

interface StlViewerProps {
  stlFile: ArrayBuffer
  onModelSize?: (width: number, height: number, depth: number, isTooLarge: boolean) => void
}

export function StlViewer({ stlFile, onModelSize }: StlViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Mesh | null>(null)
  const buildVolumeRef = useRef<THREE.LineSegments | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const modelSizeReportedRef = useRef(false)

  // Build volume dimensions in mm
  const buildVolume = {
    width: 256,
    height: 256,
    depth: 256,
  }

  // Initialize the scene
  useEffect(() => {
    if (!containerRef.current) return

    // Cleanup function for when component unmounts
    const cleanup = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement)
      }

      if (rendererRef.current) {
        rendererRef.current.dispose()
      }

      if (modelRef.current) {
        if (modelRef.current.geometry) modelRef.current.geometry.dispose()
        if (modelRef.current.material) {
          if (Array.isArray(modelRef.current.material)) {
            modelRef.current.material.forEach((material) => material.dispose())
          } else {
            modelRef.current.material.dispose()
          }
        }
      }
    }

    // Clean up any existing scene
    cleanup()

    // Create scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)
    sceneRef.current = scene

    // Create camera - start with a closer position
    const camera = new THREE.PerspectiveCamera(
      60, // Wider field of view for better visibility
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000,
    )
    // Set initial camera position closer to origin
    camera.position.set(3, 3, 3)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x888888)
    scene.add(ambientLight)

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight1.position.set(1, 1, 1)
    scene.add(directionalLight1)

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight2.position.set(-1, -1, -1)
    scene.add(directionalLight2)

    // Add controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.25
    controls.enableZoom = true
    controls.enablePan = true
    controls.autoRotate = false
    controls.minDistance = 1 // Prevent zooming in too close
    controls.maxDistance = 10 // Prevent zooming out too far
    controlsRef.current = controls

    // Add grid helper - smaller grid for better scale
    const gridHelper = new THREE.GridHelper(5, 10, 0x888888, 0xcccccc)
    scene.add(gridHelper)

    // Add build volume visualization
    // Scale down from mm to scene units (we'll use the same scale factor for the model)
    const buildVolumeScale = 0.01 // 1mm = 0.01 units in our scene
    const scaledWidth = buildVolume.width * buildVolumeScale
    const scaledHeight = buildVolume.height * buildVolumeScale
    const scaledDepth = buildVolume.depth * buildVolumeScale

    // Create wireframe box for build volume
    const buildVolumeGeometry = new THREE.BoxGeometry(scaledWidth, scaledHeight, scaledDepth)
    const edges = new THREE.EdgesGeometry(buildVolumeGeometry)
    const buildVolumeMesh = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xff5555, linewidth: 2 }),
    )

    // Center the build volume at origin
    buildVolumeMesh.position.set(0, 0, 0)
    scene.add(buildVolumeMesh)
    buildVolumeRef.current = buildVolumeMesh

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return

      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight

      camera.aspect = width / height
      camera.updateProjectionMatrix()

      renderer.setSize(width, height)
    }

    window.addEventListener("resize", handleResize)

    // Clean up on unmount
    return () => {
      window.removeEventListener("resize", handleResize)
      cleanup()
    }
  }, [])

  // Load and display the STL file
  useEffect(() => {
    if (!stlFile || !sceneRef.current) return

    // Reset the model size reported flag when a new file is loaded
    modelSizeReportedRef.current = false

    const scene = sceneRef.current

    // Remove previous model if it exists
    if (modelRef.current) {
      scene.remove(modelRef.current)
      if (modelRef.current.geometry) modelRef.current.geometry.dispose()
      if (modelRef.current.material) {
        if (Array.isArray(modelRef.current.material)) {
          modelRef.current.material.forEach((material) => material.dispose())
        } else {
          modelRef.current.material.dispose()
        }
      }
      modelRef.current = null
    }

    try {
      // Load STL file
      const loader = new STLLoader()
      const geometry = loader.parse(stlFile)

      // Center the geometry
      geometry.computeBoundingBox()
      const boundingBox = geometry.boundingBox

      if (boundingBox) {
        const center = new THREE.Vector3()
        boundingBox.getCenter(center)
        geometry.translate(-center.x, -center.y, -center.z)

        // Get model dimensions in mm
        const size = new THREE.Vector3()
        boundingBox.getSize(size)

        // Check if model is too large for build volume
        const isTooLarge = size.x > buildVolume.width || size.y > buildVolume.height || size.z > buildVolume.depth

        // Notify parent component about model size - only once per model
        if (onModelSize && !modelSizeReportedRef.current) {
          onModelSize(size.x, size.y, size.z, isTooLarge)
          modelSizeReportedRef.current = true
        }

        // Scale model to fit view
        // Use the same scale factor as the build volume
        const scale = 0.01 // 1mm = 0.01 units in our scene

        // Create material
        const material = new THREE.MeshPhongMaterial({
          color: isTooLarge ? 0xff5555 : 0x3f88c5, // Red if too large, blue otherwise
          specular: 0x111111,
          shininess: 200,
          flatShading: true,
          transparent: isTooLarge,
          opacity: isTooLarge ? 0.8 : 1.0, // Semi-transparent if too large
        })

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material)
        mesh.scale.set(scale, scale, scale)
        mesh.rotation.x = -Math.PI / 2 // Rotate to correct orientation

        // Ensure model is centered in the build volume
        mesh.position.set(0, 0, 0)

        // Add to scene
        scene.add(mesh)
        modelRef.current = mesh

        // Reset camera and controls to focus on the model and build volume
        if (cameraRef.current && controlsRef.current) {
          // Position camera to see both model and build volume
          const maxBuildDim = Math.max(buildVolume.width, buildVolume.height, buildVolume.depth) * scale
          const maxModelDim = Math.max(size.x, size.y, size.z) * scale
          const viewDistance = Math.max(maxBuildDim, maxModelDim) * 1.5

          // Position camera to view everything
          cameraRef.current.position.set(viewDistance, viewDistance, viewDistance)
          cameraRef.current.lookAt(0, 0, 0)

          // Reset controls target to center
          controlsRef.current.target.set(0, 0, 0)
          controlsRef.current.update()
        }
      }
    } catch (error) {
      console.error("Error loading STL:", error)
    }
  }, [stlFile]) // Remove onModelSize from dependency array

  return <div ref={containerRef} className="w-full h-full" />
}
