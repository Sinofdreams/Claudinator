import { create } from 'zustand'

// Small transient UI store for app-level overlays that need to be triggered from
// multiple places (e.g. the What's New popup, opened on update or from About).
interface UIState {
  whatsNewOpen: boolean
  openWhatsNew: () => void
  closeWhatsNew: () => void
}

export const useUIStore = create<UIState>((set) => ({
  whatsNewOpen: false,
  openWhatsNew: () => set({ whatsNewOpen: true }),
  closeWhatsNew: () => set({ whatsNewOpen: false })
}))
