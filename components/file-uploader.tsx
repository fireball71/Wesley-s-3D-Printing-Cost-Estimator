"use client"

import type React from "react"

import { useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useStlStore } from "@/lib/store"

export function FileUploader() {
  const [isDragging, setIsDragging] = useState(false)
  const { toast } = useToast()
  const { setModelFile, setFileName } = useStlStore()

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    handleFiles(files)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      handleFiles(files)
    }
  }

  const handleFiles = (files: FileList) => {
    if (files.length === 0) return

    const file = files[0]
    const fileName = file.name.toLowerCase()

    if (!fileName.endsWith(".stl") && !fileName.endsWith(".3mf")) {
      toast({
        title: "Invalid file format",
        description: "Please upload an STL file",
        variant: "destructive",
      })
      return
    }

    // Read the file
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) {
        setModelFile(e.target.result as ArrayBuffer)
        setFileName(file.name)
        toast({
          title: "File uploaded successfully",
          description: `${file.name} has been uploaded`,
        })
      }
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center ${
        isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
      } transition-colors duration-200 mb-6`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center space-y-4">
        <Upload className="h-12 w-12 text-gray-400" />
        <div className="space-y-1">
          <p className="text-lg font-medium">Drag and drop your STL file here, or click to browse</p>
          <p className="text-sm text-gray-500">Supported file format: .STL</p>
        </div>
        <div>
          <input id="file-upload" type="file" accept=".stl,.3mf" className="sr-only" onChange={handleFileInput} />
          <label htmlFor="file-upload">
            <Button variant="outline" className="cursor-pointer" asChild>
              <span>Browse files</span>
            </Button>
          </label>
        </div>
      </div>
    </div>
  )
}
