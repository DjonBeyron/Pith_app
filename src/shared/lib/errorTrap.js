import { reportError } from './errorReport.js'

// Глобальный перехват ошибок окна: window.onerror + unhandledrejection.
// Кольцевой буфер последних строк (по образцу debug.js) — попадает в отчёт
// кнопки «Скачать отчёт об ошибке» на экране ErrorBoundary; каждая ошибка
// также уходит в client_errors (errorReport.js, с дедупом и потолком).
const MAX_LINES = 100
const lines = []

function stamp() {
  const d = new Date()
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function push(line) {
  lines.push(`[${stamp()}] ${line}`)
  if (lines.length > MAX_LINES) lines.shift()
}

export function getErrorLines() {
  return [...lines]
}

export function initErrorTrap() {
  window.addEventListener('error', e => {
    push(`onerror: ${e.message ?? '?'} @ ${e.filename ?? '?'}:${e.lineno ?? 0}:${e.colno ?? 0}`)
    reportError({ message: e.message ?? '?', stack: e.error?.stack ?? null, source: 'onerror' })
  })
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason
    const msg = r?.message ?? String(r)
    push(`unhandledrejection: ${msg}${r?.stack ? '\n' + r.stack : ''}`)
    reportError({ message: msg, stack: r?.stack ?? null, source: 'rejection' })
  })
}
