import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PreviewWindow from './components/Notes/PreviewWindow'
import './styles/globals.css'

// The detached preview BrowserWindow loads this same bundle at the `#preview`
// route — render the lightweight preview instead of the full app there.
const isPreview = window.location.hash === '#preview'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPreview ? <PreviewWindow /> : <App />}</React.StrictMode>
)
