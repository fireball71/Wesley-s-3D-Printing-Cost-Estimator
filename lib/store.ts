import { create } from "zustand"

interface StlStoreState {
  stlFile: ArrayBuffer | null
  fileName: string
  setStlFile: (file: ArrayBuffer) => void
  setFileName: (name: string) => void
}

export const useStlStore = create<StlStoreState>((set) => ({
  stlFile: null,
  fileName: "",
  setStlFile: (file) => set({ stlFile: file }),
  setFileName: (name) => set({ fileName: name }),
}))
