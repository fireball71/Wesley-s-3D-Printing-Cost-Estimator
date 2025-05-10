import * as THREE from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader"
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils"

// Calculate volume of the STL model in cubic millimeters
export async function calculateVolume(stlFile: ArrayBuffer): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const loader = new STLLoader()
      const geometry = loader.parse(stlFile)

      if (!geometry.isBufferGeometry) {
        reject(new Error("Geometry is not a BufferGeometry"))
        return
      }

      // Ensure we have position attribute
      if (!geometry.getAttribute("position")) {
        reject(new Error("Geometry does not have position attribute"))
        return
      }

      // Convert to indexed buffer geometry if needed
      let indexedGeometry = geometry
      if (!geometry.index) {
        // Use the imported mergeVertices function directly
        indexedGeometry = mergeVertices(geometry)
      }

      // Calculate volume
      let volume = 0
      const position = indexedGeometry.getAttribute("position")
      const index = indexedGeometry.index

      if (!index) {
        reject(new Error("Failed to create indexed geometry"))
        return
      }

      for (let i = 0; i < index.count; i += 3) {
        const i1 = index.getX(i)
        const i2 = index.getX(i + 1)
        const i3 = index.getX(i + 2)

        const v1 = new THREE.Vector3(position.getX(i1), position.getY(i1), position.getZ(i1))

        const v2 = new THREE.Vector3(position.getX(i2), position.getY(i2), position.getZ(i2))

        const v3 = new THREE.Vector3(position.getX(i3), position.getY(i3), position.getZ(i3))

        // Calculate signed volume of tetrahedron formed by triangle and origin
        volume += signedVolumeOfTriangle(v1, v2, v3)
      }

      // Take absolute value and convert to cubic millimeters
      volume = Math.abs(volume)
      resolve(volume)
    } catch (error) {
      reject(error)
    }
  })
}

// Calculate signed volume of tetrahedron formed by triangle and origin
function signedVolumeOfTriangle(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): number {
  return p1.dot(p2.cross(p3)) / 6.0
}

// Estimate print time based on volume and Bambu Lab A1 normal speed
export function estimatePrintTime(volumeInMm3: number): number {
  // These are approximations based on Bambu Lab A1 normal speed
  // Actual print time depends on many factors including layer height, print speed, etc.

  // Assuming:
  // - Normal speed: ~80mm/s
  // - Layer height: 0.2mm
  // - Average extrusion rate: ~8mm³/s

  const extrusionRate = 8 // mm³ per second
  const timeInSeconds = volumeInMm3 / extrusionRate

  // Add time for non-printing movements, layer changes, etc.
  const additionalFactor = 1.5
  const totalTimeInSeconds = timeInSeconds * additionalFactor

  // Convert to hours
  return totalTimeInSeconds / 3600
}

// Calculate total cost with markup
export function calculateCost(materialCost: number, timeCost: number): number {
  const baseCost = materialCost + timeCost
  const markup = 0.7 // 70% markup
  const costWithMarkup = baseCost * (1 + markup)
  return costWithMarkup + 1 // Add $1 to every order
}
