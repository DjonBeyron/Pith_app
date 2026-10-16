import { unlockSpeech } from './linePlayback.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'

// Разблокировка звука сцены ИЗ ЖЕСТА (тап «▶ Старт», тап по сцене) — тот же
// приём, что primedAudio.js / unlockLessonAudio в уроке: автозапуск на iOS
// разрешается конкретному media-элементу, который хоть раз стартовал в жесте.
// Второй <audio> (spare) нужен только цепочке сегментов реплики-шаблона (audioChain.js): пока играет одна часть,
// на нём заранее стоит следующая. Он создаётся и разблокируется в том же жесте, но НЕ на слабых устройствах (лишний узел).
// Держим один <audio> на все сцены, греем его беззвучным wav без muted
// (приглушённый play ничего не открывает), и дальше реплики с audioUrl
// играют через него уже из эффектов. Параллельно открываем speechSynthesis.

const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

let el = null
let spare = null
let unlocked = false

function makeAudio() {
  const a = document.createElement('audio')
  a.setAttribute('playsinline', '')
  a.preload = 'auto'
  a.style.display = 'none'
  document.body.appendChild(a)
  return a
}

export function getSceneAudioElement() {
  if (typeof document === 'undefined') return null
  if (!el) el = makeAudio()
  return el
}

// Второй элемент для цепочки сегментов; null — его нет (не создавали или слабое устройство)
export const peekSceneSpareElement = () => spare

// Все элементы звука сцены (для «без звука» посреди реплики)
export function forEachSceneAudio(fn) {
  for (const a of [el, spare]) if (a) fn(a)
}

function unlockOne(a) {
  a.muted = false
  a.src = SILENCE
  const p = a.play()
  if (p?.then) p.then(() => a.pause(), () => { unlocked = false })
}

// Зовётся только из обработчика пользовательского жеста
export function unlockSceneAudio() {
  unlockSpeech()
  const a = getSceneAudioElement()
  if (!a || unlocked) return
  try {
    unlockOne(a)
    unlocked = true
    if (!spare && !isWeakDevice()) spare = makeAudio()
    if (spare) unlockOne(spare)
  } catch {
    unlocked = false
  }
}

export function sceneAudioUnlocked() {
  return unlocked
}

// Для тестов/смены страницы
export function resetSceneAudio() {
  try { el?.remove() } catch { /* ignore */ }
  try { spare?.remove() } catch { /* ignore */ }
  el = null
  spare = null
  unlocked = false
}
