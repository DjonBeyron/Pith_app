import { fdbg } from './feedDebug.js'

// Трасса жеста включения звука в ленте (для DBG-панели на iPhone): какой тап,
// в каком порядке unlock/play, чем кончился каждый play() (ok / NotAllowedError / AbortError).
// Свой кольцевой буфер (30 строк), чтобы шум общего лога не вытеснял последовательность жеста;
// заодно каждая строка уходит и в обычный fdbg-лог.

const MAX = 30
const lines = []
let step = 0

// Новый жест — новая нумерация шагов (по номеру видно порядок внутри одного тапа)
export function straceGesture(name) {
  step = 0
  strace(`── жест: ${name}`)
}

export function strace(msg) {
  const t = (performance.now() / 1000).toFixed(2)
  const line = `[${t}] #${++step} ${msg}`
  lines.push(line)
  if (lines.length > MAX) lines.shift()
  fdbg(`snd: ${msg}`)
}

export function straceLines() {
  return lines.slice()
}

// Состояние media-элемента одной строкой
export function mediaState(el) {
  if (!el) return 'нет элемента'
  return `muted=${el.muted} vol=${el.volume} paused=${el.paused} rs=${el.readyState}`
}

// Записать исход play(): label — кто вызвал, el — элемент (для снимка состояния после ответа)
export function straceOutcome(label, promise, el) {
  strace(`${label}: play() вызван (${mediaState(el)})`)
  if (!promise || !promise.then) return promise
  promise.then(
    () => strace(`${label}: play() ok (${mediaState(el)})`),
    err => strace(`${label}: play() ОТКАЗ ${err?.name ?? err} (${mediaState(el)})`),
  )
  return promise
}
