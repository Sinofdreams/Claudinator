/// <reference types="vite/client" />

// Bundle static assets (mobile page, xterm dist files) into the main bundle
// as strings so the remote server can serve them without touching disk.
declare module '*?raw' {
  const content: string
  export default content
}
