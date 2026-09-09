import { createRoot } from 'react-dom/client'
import DebugToolbar from './DebugToolbar.jsx'
import { startDebugTimeline } from './debugTimeline.js'
import { tryDebugAutoLogin } from './debugAutoLogin.js'

let mounted = false

// Точка входа дебаг-тулбара — вызывается только из App.jsx под
// import.meta.env.DEV, поэтому в прод-сборке этот chunk даже не скачивается.
export function mountDebugTools() {
  if (mounted) return
  mounted = true
  startDebugTimeline()
  tryDebugAutoLogin()
  const host = document.createElement('div')
  host.id = 'pithy-debug-tools-root'
  document.body.appendChild(host)
  createRoot(host).render(<DebugToolbar />)
}
