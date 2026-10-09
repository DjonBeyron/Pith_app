// Когда стартовать фоновую загрузку: после ухода стартового сплэша (он уходит по первому кадру видео ленты) ждём 5–8 с,
// затем первого «простоя» браузера (requestIdleCallback; в Safari его нет — обычный таймер). → cancel().
// win / rand подставляются в тестах; сама загрузка и условия «можно ли качать» — в voskBackground.js / voskBgPolicy.js.
import { startDelayMs } from './voskBgPolicy.js'

export const IDLE_TIMEOUT_MS = 10000
export const NO_IDLE_API_MS = 1000

export function scheduleBackgroundStart(start, { win = globalThis.window, rand = Math.random } = {}) {
  let cancelled = false
  let timer = null
  let idleId = null
  const idle = () => { idleId = null; if (!cancelled) start() }
  const begin = () => {
    timer = setTimeout(() => {
      timer = null
      if (cancelled) return
      if (typeof win.requestIdleCallback === 'function') idleId = win.requestIdleCallback(idle, { timeout: IDLE_TIMEOUT_MS })
      else timer = setTimeout(idle, NO_IDLE_API_MS)
    }, startDelayMs(rand()))
  }
  if (win.__pithySplashGone) begin()
  else win.addEventListener('pithy:splash-gone', begin, { once: true })
  return () => {
    cancelled = true
    clearTimeout(timer)
    if (idleId != null) win.cancelIdleCallback?.(idleId)
    win.removeEventListener?.('pithy:splash-gone', begin)
  }
}
