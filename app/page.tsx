import { FileUploader } from "@/components/file-uploader"
import { PrintCalculator } from "@/components/print-calculator"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">3D Print Cost Calculator</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Upload your STL file</h2>
            <p className="mb-4 text-gray-600">
              Upload your 3D model to calculate printing costs based on filament usage and print time.
            </p>
            <FileUploader />
            <PrintCalculator />
          </div>
        </div>
      </main>
      <footer className="bg-white shadow mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm">Pricing based on filament usage and print time</p>
        </div>
      </footer>
    </div>
  )
}
