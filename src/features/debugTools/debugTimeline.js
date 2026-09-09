// Пассивный кольцевой лог событий страницы: не трогает ни один модуль/анимацию
// напрямую — вешается один раз на document в capture-фазе и ловит всё, что
// всплывает само (старт/конец CSS-анимаций и transition, клики, ошибки
// консоли). Это даёт "поведение предыдущего модуля" для дебаг-отчёта —
// цепочку событий, которая привела к текущему кадру, а не только его самого.
import { buildSelector } from './debugSelector.js'

const MAX_EVENTS = 400
const startedAt = performance.now()
const events = []
let started = false

function push(type, extra = {}) {
  events.push({ t: Math.round(performance.now() - startedAt), type, ...extra })
  if (events.length > MAX_EVENTS) events.shift()
}

function fromEvent(e) {
  const el = e.target
  if (!(el instanceof Element)) return {}
  return { selector: buildSelector(el) }
}

function hookConsole() {
  const origError = console.error
  const origWarn = console.warn
  console.error = (...args) => {
    push('console.error', { message: args.map(String).join(' ').slice(0, 200) })
    origError(...args)
  }
  console.warn = (...args) => {
    push('console.warn', { message: args.map(String).join(' ').slice(0, 200) })
    origWarn(...args)
  }
}

export function startDebugTimeline() {
  if (started) return
  started = true
  const opts = { capture: true }
  document.addEventListener('animationstart', e => push('animationstart', { ...fromEvent(e), name: e.animationName }), opts)
  document.addEventListener('animationend', e => push('animationend', { ...fromEvent(e), name: e.animationName }), opts)
  document.addEventListener('animationcancel', e => push('animationcancel', { ...fromEvent(e), name: e.animationName }), opts)
  document.addEventListener('transitionrun', e => push('transitionrun', { ...fromEvent(e), property: e.propertyName }), opts)
  document.addEventListener('transitionend', e => push('transitionend', { ...fromEvent(e), property: e.propertyName }), opts)
  document.addEventListener('click', e => push('click', fromEvent(e)), opts)
  hookConsole()
  push('timeline-start')
}

export function getTimelineEvents() {
  return [...events]
}
