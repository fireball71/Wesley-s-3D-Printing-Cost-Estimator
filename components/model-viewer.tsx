"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader"
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader"
import { OrientationAnalyzer, type OrientationResult } from "@/lib/orientation-analyzer"

interface ModelViewerProps {
  file: ArrayBuffer
  fileName: string
  onModelSize?: (width: number, height: number, depth: number, isTooLarge: boolean) => void
}

export function ModelViewer({ file, fileName, onModelSize }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Object3D | null>(null)
  const originalModelDataRef = useRef<{
    geometry?: THREE.BufferGeometry
    object3D?: THREE.Object3D
    boundingBox?: THREE.Box3
  } | null>(null)
  const buildVolumeRef = useRef<THREE.LineSegments | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const modelSizeReportedRef = useRef(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [currentOrientation, setCurrentOrientation] = useState("original")
  const [orientationResults, setOrientationResults] = useState<OrientationResult[]>([])

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
        modelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose()
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((material) => material.dispose())
              } else {
                child.material.dispose()
              }
            }
          }
        })
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

    // Scale down from mm to scene units
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

    // Position the build volume so its bottom face is at y=0
    buildVolumeMesh.position.set(0, scaledHeight / 2, 0)
    scene.add(buildVolumeMesh)
    buildVolumeRef.current = buildVolumeMesh

    // Add grid helper - match the size of the build volume
    const gridSize = scaledWidth // Make grid match the build volume width
    const gridDivisions = 16 // More divisions for better granularity
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x888888, 0xcccccc)
    // Position the grid at y=0 (bottom of the build volume)
    gridHelper.position.y = 0
    scene.add(gridHelper)
    gridRef.current = gridHelper

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

  // Function to check if a model can fit on the build plate with repositioning
  const tryToFitModelOnBuildPlate = (
    modelSize: THREE.Vector3,
    modelMin: THREE.Vector3,
    modelMax: THREE.Vector3,
    scale: number,
  ): { canFit: boolean; offsetX: number; offsetZ: number } => {
    // Convert to scene units
    const scaledWidth = buildVolume.width * scale
    const scaledDepth = buildVolume.depth * scale

    // If the model is inherently too large (any dimension exceeds build volume), it can't fit
    if (modelSize.x > buildVolume.width || modelSize.y > buildVolume.height || modelSize.z > buildVolume.depth) {
      return { canFit: false, offsetX: 0, offsetZ: 0 }
    }

    // Calculate how much the model extends beyond each edge of the build volume
    // We're assuming the model is initially centered at (0,0,0)
    const halfScaledWidth = scaledWidth / 2
    const halfScaledDepth = scaledDepth / 2

    const scaledModelMin = new THREE.Vector3(modelMin.x * scale, modelMin.y * scale, modelMin.z * scale)

    const scaledModelMax = new THREE.Vector3(modelMax.x * scale, modelMax.y * scale, modelMax.z * scale)

    // Calculate how much we need to move the model to fit it on the build plate
    let offsetX = 0
    let offsetZ = 0

    // Check if model extends beyond left edge
    if (scaledModelMin.x < -halfScaledWidth) {
      offsetX = -halfScaledWidth - scaledModelMin.x
    }
    // Check if model extends beyond right edge
    else if (scaledModelMax.x > halfScaledWidth) {
      offsetX = halfScaledWidth - scaledModelMax.x
    }

    // Check if model extends beyond front edge
    if (scaledModelMin.z < -halfScaledDepth) {
      offsetZ = -halfScaledDepth - scaledModelMin.z
    }
    // Check if model extends beyond back edge
    else if (scaledModelMax.z > halfScaledDepth) {
      offsetZ = halfScaledDepth - scaledModelMax.z
    }

    // After applying these offsets, check if the model would fit
    const adjustedMin = new THREE.Vector3(scaledModelMin.x + offsetX, scaledModelMin.y, scaledModelMin.z + offsetZ)

    const adjustedMax = new THREE.Vector3(scaledModelMax.x + offsetX, scaledModelMax.y, scaledModelMax.z + offsetZ)

    // Check if the adjusted model fits within the build volume
    const fits =
      adjustedMin.x >= -halfScaledWidth &&
      adjustedMax.x <= halfScaledWidth &&
      adjustedMin.z >= -halfScaledDepth &&
      adjustedMax.z <= halfScaledDepth

    return { canFit: fits, offsetX, offsetZ }
  }

  // Function to analyze model and find optimal orientation
  const analyzeModelOrientation = () => {
    if (!originalModelDataRef.current) return

    setIsAnalyzing(true)

    setTimeout(() => {
      // Get the original model data
      const originalData = originalModelDataRef.current

      if (!originalData || !originalData.geometry) {
        setIsAnalyzing(false)
        return
      }

      try {
        // Use our orientation analyzer
        const analyzer = new OrientationAnalyzer(originalData.geometry.clone())
        const results = analyzer.analyzeOrientation()

        setOrientationResults(results)

        // Apply the best orientation automatically
        if (results.length > 0) {
          applyOrientation(results[0].rotation)
        }
      } catch (error) {
        console.error("Error analyzing orientation:", error)
      }

      setIsAnalyzing(false)
    }, 2000) // Simulate analysis time
  }

  // Function to apply a specific orientation
  const applyOrientation = (rotation: THREE.Euler) => {
    if (!originalModelDataRef.current || !sceneRef.current) return

    // Remove current model
    if (modelRef.current) {
      sceneRef.current.remove(modelRef.current)
    }

    // Scale factor
    const scale = 0.01

    // Apply the selected orientation
    const originalData = originalModelDataRef.current

    if (originalData.geometry) {
      // For STL files
      const geometry = originalData.geometry.clone()

      // Apply the rotation
      const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation)
      geometry.applyMatrix4(matrix)

      // Compute new bounding box
      geometry.computeBoundingBox()
      const boundingBox = geometry.boundingBox

      if (boundingBox && sceneRef.current) {
        // Get model dimensions
        const size = new THREE.Vector3()
        boundingBox.getSize(size)

        // Try to fit on build plate
        const fitResult = tryToFitModelOnBuildPlate(size, boundingBox.min, boundingBox.max, scale)

        // Create material
        const material = new THREE.MeshPhongMaterial({
          color: fitResult.canFit ? 0x3f88c5 : 0xff5555,
          specular: 0x111111,
          shininess: 200,
          flatShading: true,
          transparent: !fitResult.canFit,
          opacity: fitResult.canFit ? 1.0 : 0.8,
        })

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material)
        mesh.scale.set(scale, scale, scale)

        // Position on build plate
        mesh.position.set(fitResult.offsetX, -boundingBox.min.y * scale, fitResult.offsetZ)

        // Add to scene
        sceneRef.current.add(mesh)
        modelRef.current = mesh

        // Update orientation state
        setCurrentOrientation("custom")

        // Update model size info
        if (onModelSize && !modelSizeReportedRef.current) {
          onModelSize(size.x, size.y, size.z, !fitResult.canFit)
        }
      }
    } else if (originalData.object3D && originalData.boundingBox) {
      // For 3MF files - similar implementation would go here
      // This is more complex because we need to apply the rotation to the entire object hierarchy
      console.log("3MF orientation not fully implemented in this demo")
    }
  }

  // Load and display the 3D file
  useEffect(() => {
    if (!file || !sceneRef.current || !fileName) return

    // Reset the model size reported flag when a new file is loaded
    modelSizeReportedRef.current = false
    setCurrentOrientation("original")
    setOrientationResults([])

    // Start the analysis process immediately
    setIsAnalyzing(true)

    const scene = sceneRef.current

    // Remove previous model if it exists
    if (modelRef.current) {
      scene.remove(modelRef.current)
      modelRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material.dispose())
            } else {
              child.material.dispose()
            }
          }
        }
      })
      modelRef.current = null
    }

    // Clear original model data
    originalModelDataRef.current = null

    try {
      const isSTL = fileName.toLowerCase().endsWith(".stl")
      const is3MF = fileName.toLowerCase().endsWith(".3mf")

      // Scale down from mm to scene units
      const scale = 0.01 // 1mm = 0.01 units in our scene
      const scaledHeight = buildVolume.height * scale

      if (isSTL) {
        // Load STL file
        const loader = new STLLoader()
        const geometry = loader.parse(file)

        // Store original geometry for later use
        originalModelDataRef.current = {
          geometry: geometry.clone(),
        }

        // Compute bounding box to get dimensions
        geometry.computeBoundingBox()
        const boundingBox = geometry.boundingBox

        if (boundingBox) {
          // Get model dimensions in mm
          const size = new THREE.Vector3()
          boundingBox.getSize(size)

          // Try to fit the model on the build plate
          const fitResult = tryToFitModelOnBuildPlate(size, boundingBox.min, boundingBox.max, scale)

          // Check if model is too large for build volume after trying to reposition
          const isTooLarge = !fitResult.canFit

          // Notify parent component about model size - only once per model
          if (onModelSize && !modelSizeReportedRef.current) {
            onModelSize(size.x, size.y, size.z, isTooLarge)
            modelSizeReportedRef.current = true
          }

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

          // Position the model on the build plate
          // 1. Place bottom on the grid (y=0)
          // 2. Apply the calculated offsets to fit on the build plate
          mesh.position.set(fitResult.offsetX, -boundingBox.min.y * scale, fitResult.offsetZ)

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
            cameraRef.current.lookAt(0, scaledHeight / 2, 0)

            // Reset controls target to center of build volume
            controlsRef.current.target.set(0, scaledHeight / 4, 0)
            controlsRef.current.update()
          }

          // Automatically run orientation analysis after a short delay
          setTimeout(() => {
            analyzeModelOrientation()
          }, 500)
        }
      } else if (is3MF) {
        // Create a blob from the ArrayBuffer
        const blob = new Blob([file])
        const url = URL.createObjectURL(blob)

        // Load 3MF file
        const loader = new ThreeMFLoader()
        loader.load(
          url,
          (object) => {
            // Store original object for later use
            const originalObject = object.clone()

            // Calculate bounding box for the entire object
            const box = new THREE.Box3().setFromObject(object)

            originalModelDataRef.current = {
              object3D: originalObject,
              boundingBox: box.clone(),
            }

            const size = new THREE.Vector3()
            box.getSize(size)

            // Try to fit the model on the build plate
            const fitResult = tryToFitModelOnBuildPlate(size, box.min, box.max, scale)

            // Check if model is too large for build volume after trying to reposition
            const isTooLarge = !fitResult.canFit

            // Notify parent component about model size - only once per model
            if (onModelSize && !modelSizeReportedRef.current) {
              onModelSize(size.x, size.y, size.z, isTooLarge)
              modelSizeReportedRef.current = true
            }

            // Scale model
            object.scale.set(scale, scale, scale)

            // Position the model on the build plate
            // 1. Place bottom on the grid (y=0)
            // 2. Apply the calculated offsets to fit on the build plate
            object.position.set(fitResult.offsetX, -box.min.y * scale, fitResult.offsetZ)

            // Color the model based on size
            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.material = new THREE.MeshPhongMaterial({
                  color: isTooLarge ? 0xff5555 : 0x3f88c5,
                  specular: 0x111111,
                  shininess: 200,
                  flatShading: true,
                  transparent: isTooLarge,
                  opacity: isTooLarge ? 0.8 : 1.0,
                })
              }
            })

            // Add to scene
            scene.add(object)
            modelRef.current = object

            // Reset camera and controls to focus on the model and build volume
            if (cameraRef.current && controlsRef.current) {
              // Position camera to see both model and build volume
              const maxBuildDim = Math.max(buildVolume.width, buildVolume.height, buildVolume.depth) * scale
              const maxModelDim = Math.max(size.x, size.y, size.z) * scale
              const viewDistance = Math.max(maxBuildDim, maxModelDim) * 1.5

              // Position camera to view everything
              cameraRef.current.position.set(viewDistance, viewDistance, viewDistance)
              cameraRef.current.lookAt(0, scaledHeight / 2, 0)

              // Reset controls target to center of build volume
              controlsRef.current.target.set(0, scaledHeight / 4, 0)
              controlsRef.current.update()
            }

            // Clean up the URL
            URL.revokeObjectURL(url)

            // Automatically run orientation analysis after a short delay
            setTimeout(() => {
              analyzeModelOrientation()
            }, 500)
          },
          undefined,
          (error) => {
            console.error("Error loading 3MF file:", error)
            URL.revokeObjectURL(url)
            setIsAnalyzing(false)
          },
        )
      } else {
        console.error("Unsupported file format")
        setIsAnalyzing(false)
      }
    } catch (error) {
      console.error("Error loading 3D model:", error)
      setIsAnalyzing(false)
    }
  }, [file, fileName])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* AI Analysis Loading Overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
          <div className="text-6xl mb-4 animate-pulse">🧠</div>
          <h3 className="text-white text-xl font-semibold mb-2">AI Orientation Analysis</h3>
          <p className="text-white/80 text-center max-w-md">
            Analyzing model features to determine the optimal print orientation...
          </p>
        </div>
      )}
    </div>
  )
}
