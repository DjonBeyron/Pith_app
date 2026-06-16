const KEY = 'pithy_debug'

let enabled = false
try {
  enabled = localStorage.getItem(KEY) === '1'
} catch {
  enabled = false
}

// Buffers every dbg() line so it can be exported to a .txt file — useful on a phone where
// there's no devtools console to read from directly.
const logLines = []

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

function stamp() {
  const d = new Date()
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function toText(arg) {
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

export function dbg(...args) {
  if (!enabled) return
  console.log('[PITHY]', ...args)
  logLines.push(`[${stamp()}] ${args.map(toText).join(' ')}`)
}

export function downloadLog() {
  const text = logLines.length
    ? logLines.join('\n')
    : '(лог пуст — включи дебаг и повтори действия перед скачиванием)'
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const a = document.createElement('a')
  a.href = url
  a.download = `pithy-debug-${ts}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
