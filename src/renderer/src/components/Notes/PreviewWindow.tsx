import { useEffect, useState } from 'react'

/**
 * Standalone renderer for the detached preview BrowserWindow (loaded at the
 * `#preview` route). It owns no note state — it just renders whatever rendered
 * HTML + theme the editor window streams over via the main process.
 */
export default function PreviewWindow(): JSX.Element {
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('')

  useEffect(() => {
    const unsub = window.api.onPreviewData((data) => {
      setHtml(data.html)
      setTitle(data.title)
      document.documentElement.setAttribute('data-theme', data.theme)
    })
    // Now that the listener is attached, ask main for the current payload.
    window.api.previewReady()
    return unsub
  }, [])

  useEffect(() => {
    document.title = title ? `${title} — Preview` : 'Markdown Preview'
  }, [title])

  return (
    <div
      className="md-preview"
      style={{
        height: '100vh',
        overflowY: 'auto',
        padding: '20px 26px',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
