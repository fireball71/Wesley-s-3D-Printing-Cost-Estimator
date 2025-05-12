import * as THREE from "three"

// Types for orientation analysis
export interface OrientationResult {
  rotation: THREE.Euler
  score: number
  supportVolume: number
  printTime: number
  quality: number
  description: string
}

export interface FeatureDetectionResult {
  hasFlatSurfaces: boolean
  flatSurfaceIndices: number[]
  hasHoles: boolean
  holeIndices: number[]
  hasOverhangs: boolean
  overhangIndices: number[]
  functionalDirection?: THREE.Vector3
}

// Main orientation analyzer class
export class OrientationAnalyzer {
  private geometry: THREE.BufferGeometry
  private mesh: THREE.Mesh
  private normalThreshold = 0.95 // Cosine threshold for considering a face "up" (about 18 degrees)
  private holeDetectionThreshold = 0.8 // Threshold for detecting holes

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  }

  // Analyze the model to find the best orientation
  public analyzeOrientation(): OrientationResult[] {
    // Detect features in the model
    const features = this.detectFeatures()

    // Generate candidate orientations
    const candidates = this.generateCandidateOrientations(features)

    // Score each orientation
    const scoredOrientations = this.scoreOrientations(candidates, features)

    // Sort by score (highest first)
    return scoredOrientations.sort((a, b) => b.score - a.score)
  }

  // Detect important features in the model
  private detectFeatures(): FeatureDetectionResult {
    // Initialize result
    const result: FeatureDetectionResult = {
      hasFlatSurfaces: false,
      flatSurfaceIndices: [],
      hasHoles: false,
      holeIndices: [],
      hasOverhangs: false,
      overhangIndices: [],
    }

    // Ensure we have position and normal attributes
    if (!this.geometry.attributes.position || !this.geometry.attributes.normal) {
      console.warn("Geometry missing position or normal attributes")
      return result
    }

    // Get positions and normals
    const positions = this.geometry.attributes.position
    const normals = this.geometry.attributes.normal

    // Analyze the geometry to find flat surfaces (potential build plate contact)
    const upVector = new THREE.Vector3(0, 1, 0)
    const downVector = new THREE.Vector3(0, -1, 0)

    // For hole detection, we'll look for clusters of faces with normals pointing inward
    const potentialHoleFaces: number[] = []

    // For each face in the geometry
    for (let i = 0; i < positions.count; i += 3) {
      // Get face normal (average of vertex normals)
      const normal = new THREE.Vector3()
      normal.x = (normals.getX(i) + normals.getX(i + 1) + normals.getX(i + 2)) / 3
      normal.y = (normals.getY(i) + normals.getY(i + 1) + normals.getY(i + 2)) / 3
      normal.z = (normals.getZ(i) + normals.getZ(i + 1) + normals.getZ(i + 2)) / 3
      normal.normalize()

      // Check if this is a flat surface (normal pointing up)
      if (normal.dot(upVector) > this.normalThreshold) {
        result.hasFlatSurfaces = true
        result.flatSurfaceIndices.push(i / 3)
      }

      // Check if this could be part of a hole (normal pointing inward)
      // This is a simplified approach - real hole detection is more complex
      if (this.isPotentialHoleFace(i, positions, normal)) {
        potentialHoleFaces.push(i / 3)
      }

      // Check for overhangs (faces pointing downward)
      if (normal.dot(downVector) > this.normalThreshold * 0.7) {
        result.hasOverhangs = true
        result.overhangIndices.push(i / 3)
      }
    }

    // Process potential hole faces to identify actual holes
    if (potentialHoleFaces.length > 0) {
      result.hasHoles = true
      result.holeIndices = this.processHoleCandidates(potentialHoleFaces)

      // If we found holes, determine their functional direction
      if (result.holeIndices.length > 0) {
        result.functionalDirection = this.determineFunctionalDirection(result.holeIndices)
      }
    }

    return result
  }

  // Check if a face could be part of a hole
  private isPotentialHoleFace(faceIndex: number, positions: THREE.BufferAttribute, normal: THREE.Vector3): boolean {
    // Get face vertices
    const v1 = new THREE.Vector3(positions.getX(faceIndex), positions.getY(faceIndex), positions.getZ(faceIndex))
    const v2 = new THREE.Vector3(
      positions.getX(faceIndex + 1),
      positions.getY(faceIndex + 1),
      positions.getZ(faceIndex + 1),
    )
    const v3 = new THREE.Vector3(
      positions.getX(faceIndex + 2),
      positions.getY(faceIndex + 2),
      positions.getZ(faceIndex + 2),
    )

    // Calculate face center
    const center = new THREE.Vector3()
    center.add(v1).add(v2).add(v3).divideScalar(3)

    // Vector from center of geometry to face center
    const toCenterVector = new THREE.Vector3()
    this.geometry.computeBoundingBox()
    if (this.geometry.boundingBox) {
      const geometryCenter = new THREE.Vector3()
      this.geometry.boundingBox.getCenter(geometryCenter)
      toCenterVector.subVectors(geometryCenter, center).normalize()

      // If normal points roughly toward center, this might be inside a hole
      return normal.dot(toCenterVector) > this.holeDetectionThreshold
    }

    return false
  }

  // Process hole candidates to identify actual holes
  private processHoleCandidates(candidates: number[]): number[] {
    // In a real implementation, this would use clustering and more sophisticated
    // algorithms to identify actual holes vs. other concave features

    // For this simplified version, we'll just return the candidates
    // but in practice you'd want to filter these further
    return candidates
  }

  // Determine the functional direction of the model based on holes
  private determineFunctionalDirection(holeIndices: number[]): THREE.Vector3 {
    // In a real implementation, this would analyze the distribution and orientation
    // of holes to determine which way the model should face

    // For this simplified version, we'll calculate an average normal for the hole faces
    const avgNormal = new THREE.Vector3()
    const normals = this.geometry.attributes.normal

    for (const index of holeIndices) {
      const i = index * 3
      const normal = new THREE.Vector3(
        (normals.getX(i) + normals.getX(i + 1) + normals.getX(i + 2)) / 3,
        (normals.getY(i) + normals.getY(i + 1) + normals.getY(i + 2)) / 3,
        (normals.getZ(i) + normals.getZ(i + 1) + normals.getZ(i + 2)) / 3,
      )
      normal.normalize()
      avgNormal.add(normal)
    }

    if (holeIndices.length > 0) {
      avgNormal.divideScalar(holeIndices.length)
    }

    // The functional direction is opposite to the average hole normal
    // (holes typically face outward from the functional direction)
    return avgNormal.negate().normalize()
  }

  // Generate candidate orientations based on detected features
  private generateCandidateOrientations(features: FeatureDetectionResult): THREE.Euler[] {
    const candidates: THREE.Euler[] = []

    // Add standard orientations (6 sides of a cube)
    candidates.push(
      new THREE.Euler(0, 0, 0), // Original orientation
      new THREE.Euler(Math.PI / 2, 0, 0), // Rotated 90° around X
      new THREE.Euler(-Math.PI / 2, 0, 0), // Rotated -90° around X
      new THREE.Euler(0, Math.PI / 2, 0), // Rotated 90° around Y
      new THREE.Euler(0, -Math.PI / 2, 0), // Rotated -90° around Y
      new THREE.Euler(Math.PI, 0, 0), // Rotated 180° around X
    )

    // If we detected a functional direction, add orientations that place it upward
    if (features.functionalDirection) {
      const upVector = new THREE.Vector3(0, 1, 0)
      const rotationAxis = new THREE.Vector3()
      rotationAxis.crossVectors(features.functionalDirection, upVector).normalize()

      if (rotationAxis.length() > 0.01) {
        // Avoid zero-length rotation axis
        const angle = Math.acos(features.functionalDirection.dot(upVector))
        const quaternion = new THREE.Quaternion()
        quaternion.setFromAxisAngle(rotationAxis, angle)

        const euler = new THREE.Euler()
        euler.setFromQuaternion(quaternion)

        candidates.push(euler)
      }
    }

    return candidates
  }

  // Score each orientation based on multiple factors
  private scoreOrientations(orientations: THREE.Euler[], features: FeatureDetectionResult): OrientationResult[] {
    const results: OrientationResult[] = []

    for (const orientation of orientations) {
      // Create a temporary mesh with this orientation
      const tempGeometry = this.geometry.clone()
      const tempMesh = new THREE.Mesh(tempGeometry)
      tempMesh.rotation.copy(orientation)
      tempMesh.updateMatrix()
      tempGeometry.applyMatrix4(tempMesh.matrix)

      // Calculate support volume needed
      const supportVolume = this.calculateSupportVolume(tempGeometry)

      // Estimate print time
      const printTime = this.estimatePrintTime(tempGeometry, supportVolume)

      // Estimate print quality
      const quality = this.estimatePrintQuality(tempGeometry, features)

      // Calculate overall score (weighted sum of factors)
      const score = this.calculateOverallScore(supportVolume, printTime, quality, features, orientation)

      // Generate a description of this orientation
      const description = this.generateOrientationDescription(orientation, score, supportVolume, features)

      results.push({
        rotation: orientation.clone(),
        score,
        supportVolume,
        printTime,
        quality,
        description,
      })
    }

    return results
  }

  // Calculate how much support material would be needed
  private calculateSupportVolume(geometry: THREE.BufferGeometry): number {
    // In a real implementation, this would analyze the geometry to find
    // overhanging faces that need support

    // For this simplified version, we'll count faces pointing downward
    let supportFaceCount = 0
    const normals = geometry.attributes.normal
    const downVector = new THREE.Vector3(0, -1, 0)

    for (let i = 0; i < normals.count; i += 3) {
      const normal = new THREE.Vector3(
        (normals.getX(i) + normals.getX(i + 1) + normals.getX(i + 2)) / 3,
        (normals.getY(i) + normals.getY(i + 1) + normals.getY(i + 2)) / 3,
        (normals.getZ(i) + normals.getZ(i + 1) + normals.getZ(i + 2)) / 3,
      )
      normal.normalize()

      if (normal.dot(downVector) > 0.7) {
        // Faces pointing more than ~45° downward
        supportFaceCount++
      }
    }

    return supportFaceCount / (normals.count / 3) // Normalize to 0-1 range
  }

  // Estimate print time based on height and support volume
  private estimatePrintTime(geometry: THREE.BufferGeometry, supportVolume: number): number {
    // Calculate bounding box to get height
    geometry.computeBoundingBox()
    if (!geometry.boundingBox) return 1

    const height = geometry.boundingBox.max.y - geometry.boundingBox.min.y

    // Print time is roughly proportional to height and support volume
    return height * (1 + supportVolume * 0.5) // Normalized score
  }

  // Estimate print quality based on orientation of important features
  private estimatePrintQuality(geometry: THREE.BufferGeometry, features: FeatureDetectionResult): number {
    // In a real implementation, this would analyze how critical features
    // are oriented relative to the print direction

    // For this simplified version, we'll check if holes are pointing upward
    if (features.hasHoles && features.functionalDirection) {
      const upVector = new THREE.Vector3(0, 1, 0)
      const functionalDot = features.functionalDirection.dot(upVector)

      // Higher score if functional direction is pointing up
      return (functionalDot + 1) / 2 // Map from [-1,1] to [0,1]
    }

    return 0.5 // Neutral score if no special features
  }

  // Calculate overall score for an orientation
  private calculateOverallScore(
    supportVolume: number,
    printTime: number,
    quality: number,
    features: FeatureDetectionResult,
    orientation: THREE.Euler,
  ): number {
    // Weights for different factors
    const weights = {
      supportVolume: 0.3,
      printTime: 0.2,
      quality: 0.5,
    }

    // Invert support volume and print time (lower is better)
    const supportScore = 1 - supportVolume
    const timeScore = 1 - printTime

    // Calculate weighted score
    let score = supportScore * weights.supportVolume + timeScore * weights.printTime + quality * weights.quality

    // Bonus for orientations that place functional features correctly
    if (features.hasHoles && features.functionalDirection) {
      // Create a vector representing the up direction after rotation
      const upVector = new THREE.Vector3(0, 1, 0)
      const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(orientation)
      const rotatedUp = upVector.clone().applyMatrix4(rotationMatrix)

      // Check if functional direction is aligned with rotated up vector
      const alignment = features.functionalDirection.dot(rotatedUp)

      // Add bonus if well-aligned (functional direction pointing up)
      if (alignment > 0.8) {
        score += 0.2
      }
    }

    return score
  }

  // Generate a human-readable description of the orientation
  private generateOrientationDescription(
    orientation: THREE.Euler,
    score: number,
    supportVolume: number,
    features: FeatureDetectionResult,
  ): string {
    // Convert rotation to degrees for readability
    const xDeg = Math.round((orientation.x * 180) / Math.PI)
    const yDeg = Math.round((orientation.y * 180) / Math.PI)
    const zDeg = Math.round((orientation.z * 180) / Math.PI)

    let description = `Rotation: ${xDeg}°, ${yDeg}°, ${zDeg}°`

    // Add information about support and quality
    description += ` | Support: ${Math.round(supportVolume * 100)}%`

    // Add special feature information
    if (features.hasHoles) {
      // Check if holes are pointing up in this orientation
      const upVector = new THREE.Vector3(0, 1, 0)
      const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(orientation)
      const rotatedUp = upVector.clone().applyMatrix4(rotationMatrix)

      if (features.functionalDirection) {
        const alignment = features.functionalDirection.dot(rotatedUp)

        if (alignment > 0.8) {
          description += " | Holes facing upward (optimal)"
        } else if (alignment < -0.8) {
          description += " | Holes facing downward (poor)"
        } else {
          description += " | Holes facing sideways"
        }
      }
    }

    // Add overall assessment
    if (score > 0.8) {
      description += " | Excellent orientation"
    } else if (score > 0.6) {
      description += " | Good orientation"
    } else if (score > 0.4) {
      description += " | Average orientation"
    } else {
      description += " | Poor orientation"
    }

    return description
  }
}
