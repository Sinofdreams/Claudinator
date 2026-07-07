import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  type: 'error' | 'info'
}

// Small transient UI store for app-level overlays that need to be triggered from
// multiple places (e.g. the What's New popup, opened on update or from About).
interface UIState {
  whatsNewOpen: boolean
  openWhatsNew: () => void
  closeWhatsNew: () => void
  toasts: Toast[]
  showToast: (message: string, type?: Toast['type']) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

export const useUIStore = create<UIState>((set) => ({
  whatsNewOpen: false,
  openWhatsNew: () => set({ whatsNewOpen: true }),
  closeWhatsNew: () => set({ whatsNewOpen: false }),

  toasts: [],
  showToast: (message, type = 'error') => {
    const id = nextToastId++
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
