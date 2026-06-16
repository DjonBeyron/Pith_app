const KEY = 'pithy_debug'

let enabled = false
try {
  enabled = localStorage.getItem(KEY) === '1'
} catch {
  enabled = false
}

export function isDebugOn() {
  return enabled
}

export function setDebug(on) {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // localStorage unavailable — debug flag just won't persist across reloads
  }
}

export function dbg(...args) {
  if (enabled) console.log('[PITHY]', ...args)
}
