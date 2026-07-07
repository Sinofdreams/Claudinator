/// <reference types="vite/client" />

import type { Api } from '../../preload/index'
import type { JSX as ReactJSX } from 'react'

declare global {
  interface Window {
    api: Api
  }

  // React 19 removed the global JSX namespace (it lives at React.JSX now).
  // Components here annotate their return type as JSX.Element — alias it
  // rather than churning every file. Element *checking* is unaffected: with
  // jsx: react-jsx, tsc resolves that through react/jsx-runtime, not this.
  namespace JSX {
    type Element = ReactJSX.Element
  }
}
