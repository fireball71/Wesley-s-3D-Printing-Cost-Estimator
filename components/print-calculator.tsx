"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useStlStore } from "@/lib/store"
import { ModelViewer } from "@/components/model-viewer"
import { calculateVolume, estimatePrintTime, calculateCost } from "@/lib/calculations"
import { Loader2, AlertTriangle, Mail, Info, ShoppingCart } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"

export function PrintCalculator() {
  const { modelFile, fileName } = useStlStore()
  const [volume, setVolume] = useState<number | null>(null)
  const [weight, setWeight] = useState<number | null>(null)
  const [printTime, setPrintTime] = useState<number | null>(null)
  const [cost, setCost] = useState<number | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [viewerKey, setViewerKey] = useState(0) // Add key to force re-render
  const [modelDimensions, setModelDimensions] = useState<{
    width: number
    height: number
    depth: number
    isTooLarge: boolean
  } | null>(null)
  const modelSizeCallbackRef = useRef<Function | null>(null)
  const { toast } = useToast()

  // Hardcoded values for PLA density and 20% infill
  const density = 1.24 // PLA density in g/cm³
  const infill = 20 // Fixed infill percentage

  useEffect(() => {
    // Reset calculations when a new file is uploaded
    if (modelFile) {
      setVolume(null)
      setWeight(null)
      setPrintTime(null)
      setCost(null)
      setModelDimensions(null)
      setViewerKey((prev) => prev + 1) // Force re-render of viewer when file changes
    }
  }, [modelFile])

  // Store the callback in a ref to avoid dependency issues
  useEffect(() => {
    modelSizeCallbackRef.current = (width: number, height: number, depth: number, isTooLarge: boolean) => {
      setModelDimensions({
        width,
        height,
        depth,
        isTooLarge,
      })
    }
  }, [])

  // Memoize the handleModelSize function to prevent it from changing on every render
  const handleModelSize = useCallback((width: number, height: number, depth: number, isTooLarge: boolean) => {
    if (modelSizeCallbackRef.current) {
      ;(modelSizeCallbackRef.current as Function)(width, height, depth, isTooLarge)
    }
  }, [])

  const handleCalculate = async () => {
    if (!modelFile) return

    setIsCalculating(true)

    try {
      // Calculate volume in cubic millimeters
      const volumeInMm3 = await calculateVolume(modelFile, fileName)
      const volumeInCm3 = volumeInMm3 / 1000 // Convert to cm³
      setVolume(volumeInCm3)

      // Calculate weight based on density and infill
      const effectiveVolume = volumeInCm3 * (0.2 + (infill / 100) * 0.8) // Accounting for infill
      const weightInGrams = effectiveVolume * density
      setWeight(weightInGrams)

      // Estimate print time in hours (based on Bambu Lab A1 normal speed)
      const timeInHours = estimatePrintTime(volumeInMm3)
      setPrintTime(timeInHours)

      // Calculate total cost
      const materialCost = weightInGrams * 0.015 // $0.015 per gram
      const timeCost = timeInHours * 0.5 // $0.50 per hour
      const totalCost = calculateCost(materialCost, timeCost)
      setCost(totalCost)
    } catch (error) {
      console.error("Error calculating print details:", error)
    } finally {
      setIsCalculating(false)
    }
  }

  const handleContactWesley = () => {
    const subject = encodeURIComponent(`Large 3D Print Request: ${fileName}`)
    const body = encodeURIComponent(
      `Hello Wesley,\n\nI'm interested in printing a model that exceeds your printer's build volume.\n\n` +
        `Model name: ${fileName}\n` +
        `Dimensions: ${modelDimensions?.width.toFixed(2)}mm x ${modelDimensions?.height.toFixed(2)}mm x ${modelDimensions?.depth.toFixed(2)}mm\n\n` +
        `Could you please let me know if this can be printed in multiple parts or if you have any other solutions?\n\n` +
        `Thank you,\n`,
    )

    window.open(`mailto:wesley.a.tanner@gmail.com?subject=${subject}&body=${body}`, "_blank")
  }

  if (!modelFile) {
    return null
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">Model Preview and Calculations</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-[400px] overflow-hidden">
            <CardContent className="p-0 h-full">
              <ModelViewer key={viewerKey} file={modelFile} fileName={fileName} onModelSize={handleModelSize} />
            </CardContent>
          </Card>

          {modelDimensions && (
            <div className="mt-2 text-sm text-gray-600">
              <div className="flex items-center">
                <span>
                  Model dimensions: {modelDimensions.width.toFixed(2)}mm × {modelDimensions.height.toFixed(2)}mm ×{" "}
                  {modelDimensions.depth.toFixed(2)}mm
                </span>
                {modelDimensions.isTooLarge && (
                  <span className="text-red-500 ml-2">(Exceeds build volume of 256mm × 256mm × 256mm)</span>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="px-2 py-0 h-auto">
                        <Info className="h-4 w-4 text-gray-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        AI has automatically analyzed and oriented your model for optimal printing.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="mt-1 text-xs text-emerald-600">
                <span className="inline-flex items-center">
                  <span className="mr-1">🧠</span> AI has automatically oriented this model for optimal printing
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-medium text-lg mb-4">{fileName}</h3>

              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">Using PLA material with 20% infill</p>
              </div>

              {modelDimensions?.isTooLarge && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Model Too Large</AlertTitle>
                  <AlertDescription>
                    This model exceeds the build volume (256mm × 256mm × 256mm) and cannot be printed in one piece. AI
                    has tried to find the best orientation, but it's still too large.
                  </AlertDescription>
                  <Button
                    variant="destructive"
                    className="w-full mt-2 flex items-center justify-center"
                    onClick={handleContactWesley}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Contact Wesley for Options
                  </Button>
                </Alert>
              )}

              <Button
                onClick={handleCalculate}
                className="w-full mb-6"
                disabled={isCalculating || modelDimensions?.isTooLarge}
              >
                {isCalculating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  "Calculate Print Cost"
                )}
              </Button>

              {volume !== null &&
                weight !== null &&
                printTime !== null &&
                cost !== null &&
                !modelDimensions?.isTooLarge && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Volume:</span>
                      <span className="font-medium">{volume.toFixed(2)} cm³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estimated Weight:</span>
                      <span className="font-medium">{weight.toFixed(2)} g</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estimated Print Time:</span>
                      <span className="font-medium">{printTime.toFixed(2)} hours</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-gray-800 font-medium">Total Cost:</span>
                      <span className="text-xl font-bold text-green-600">${cost.toFixed(2)}</span>
                    </div>

                    {/* Order button as simple link */}
                    <a href="https://sites.google.com/view/w3dprinting/pla-form" className="block w-full mt-4">
                      <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Order This Model
                      </Button>
                    </a>
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
