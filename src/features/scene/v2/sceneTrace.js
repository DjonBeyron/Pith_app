import { pLog } from '../../../shared/lib/debug.js'

// Трасса сцены (кружок/пузырь) для разбора жалоб «сначала не звучит», «кольцо подвисает в конце», «повторный тап
// выбивает из крупного режима»: кольцевой буфер строк с временем от загрузки страницы + дубль в pLog (`[scene] …`,
// попадает в «⬇ лог» урока — downloadDebugLog.js пропускает `[scene]` даже в режиме AUDIO_ONLY). Пишут сюда:
//  · useScenePlayback (состояния режиссёра, автозапуск, команды, раскрытие, заморозка),
//  · circle/useCircleExpand + useSceneCircleExpand (каждый тап: раскрыть / свернуть / пропущен и почему, свайп, Esc,
//    авто-сворачивание после конца, «кружок дорос»),
//  · useSceneProgress (шаги кольца, доезд до 1, состояние старше индикатора),
//  · useSceneDirectorV2 / SceneRenderer (режиссёр создан/сброшен, авто-пауза, команда отложена, вне экрана),
//  · audioLine / linePlayback / scenePlayLine (откуда файл, play() вызван/ok/отказ, зазвучал, буферизация, конец,
//    синтез/таймер и почему).
// Живое окно у админа — SceneCircleDebug.jsx под кружком (подписка subscribeSceneTrace). Без React и DOM: тестируется напрямую.

const MAX = 240
const buf = []
const subs = new Set()
let seq = 0
let tagSeq = 0

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const fmtT = t => (t / 1000).toFixed(2)

export function sceneTrace(msg) {
  const line = `[${fmtT(nowMs())}] ${msg}`
  buf.push(line)
  if (buf.length > MAX) buf.splice(0, buf.length - MAX + 40)
  seq += 1
  try { pLog(`[scene] ${msg}`) } catch { /* журнал недоступен — строка остаётся в буфере */ }
  subs.forEach(fn => { try { fn(seq) } catch { /* подписчик упал — трассу не роняем */ } })
}

export const sceneTraceLines = () => buf.slice()
export const sceneTraceSeq = () => seq
export function subscribeSceneTrace(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
export function resetSceneTrace() { buf.length = 0; seq = 0 }

// Короткая метка экземпляра сцены в ленте (#1, #2 …): в уроке несколько сцен, по метке видно, чьи строки
export const nextSceneTag = () => `#${++tagSeq}`

// Вид ссылки звука — что именно отдали элементу: blob прогрева, кэш подкачки (тоже blob), data (прогрев тишиной), http
export function srcKind(src) {
  const s = String(src ?? '')
  if (!s) return '—'
  if (s.startsWith('blob:')) return 'blob'
  if (s.startsWith('data:')) return 'data'
  if (/^https?:/.test(s)) return 'http:' + s.split('/').pop().slice(0, 24)
  return s.slice(0, 16)
}

// Состояние <audio> одной строкой (поля могут отсутствовать у подделок в тестах)
export function audioState(el) {
  if (!el) return 'нет элемента'
  const n = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '?')
  return `muted=${!!el.muted} paused=${el.paused !== false} rs=${el.readyState ?? '?'} t=${n(el.currentTime)} dur=${n(el.duration)} src=${srcKind(el.src)}`
}

// Короткий текст реплики для строки трассы
export const shortText = (t, n = 28) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export const ms = v => `${Math.round(v)} мс`
