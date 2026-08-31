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

// Player log — always collected, no debug flag needed.
// Use pLog() for player events so they can be downloaded even without enabling debug.
const playerLines = []

export function isDebugOn() {
  return enabled
}

// ── Покадровые трассы ────────────────────────────────────────────────────
// Отдельный флаг, а не общий debug: трассы измеряют раскладку каждый кадр
// (getBoundingClientRect, getComputedStyle, querySelectorAll по документу) и
// тем самым СЛОМИТЕЛЬНО влияют на то, что измеряют. Замер салюта на iPhone 16
// Pro показал 54 к/с и худший кадр 48мс — и виноваты были не анимации, а
// именно эти трассы, работавшие в тот же момент.
//
// Поэтому по умолчанию выключены. Включаются на устройстве без пересборки:
//   · адрес с ?trace=1
//   · или из консоли: localStorage.pithyTrace = '1', перезагрузить
const TRACE_KEY = 'pithyTrace'
let tracing = false
try {
  const q = typeof location !== 'undefined' && new URLSearchParams(location.search).get('trace')
  if (q === '1' || q === '0') localStorage.setItem(TRACE_KEY, q)
  tracing = localStorage.getItem(TRACE_KEY) === '1'
} catch {
  // нет localStorage — трассы просто останутся выключенными
}

export function isTraceOn() {
  return tracing
}

export function setTrace(on) {
  tracing = on
  try {
    localStorage.setItem(TRACE_KEY, on ? '1' : '0')
  } catch {
    // не сохранится между перезагрузками — не страшно
  }
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
  console.log('[HETA]', ...args)
  logLines.push(`[${stamp()}] ${args.map(toText).join(' ')}`)
}

// Always-on player logger — collects regardless of debug flag.
// Use for player/voice-record events that need to be inspected on mobile.
export function pLog(...args) {
  const line = `[${stamp()}] ${args.map(toText).join(' ')}`
  playerLines.push(line)
  if (enabled) console.log('[PLAYER]', ...args)
}

export function clearPlayerLog() {
  playerLines.length = 0
}

export function getPlayerLines() {
  return [...playerLines]
}

export function downloadPlayerLog() {
  const text = playerLines.length
    ? playerLines.join('\n')
    : '(лог пуст — открой плеер и повтори действия, затем нажми скачать)'
  const blob = new Blob([text], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const ts   = new Date().toISOString().replace(/[:.]/g, '-')
  const a    = document.createElement('a')
  a.href     = url
  a.download = `pithy-player-${ts}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
