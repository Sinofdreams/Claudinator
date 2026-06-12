import { useEffect } from 'react'

/**
 * While the calling component is mounted, dims the OS title-bar caption-button
 * overlay so it matches a full-screen modal's dimmed backdrop. The OS draws that
 * strip on top of the window, so it can't be covered by the React backdrop —
 * the main process darkens it instead. Ref-counted in main, so stacked modals
 * are safe.
 *
 * Pass `active` to drive dimming from state (e.g. a conditionally-rendered
 * overlay) without violating the rules of hooks. Defaults to true so components
 * that only mount while their modal is open can call it bare.
 */
export function useTitleBarDim(active = true): void {
  useEffect(() => {
    if (!active) return
    window.api.setTitleBarDim?.(true)
    return () => {
      window.api.setTitleBarDim?.(false)
    }
  }, [active])
}
