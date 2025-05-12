import { create } from "zustand"

interface ModelStoreState {
  modelFile: ArrayBuffer | null
  fileName: string
  setModelFile: (file: ArrayBuffer) => void
  setFileName: (name: string) => void
}

export const useStlStore = create<ModelStoreState>((set) => ({
  modelFile: null,
  fileName: "",
  setModelFile: (file) => set({ modelFile: file }),
  setFileName: (name) => set({ fileName: name }),
}))
