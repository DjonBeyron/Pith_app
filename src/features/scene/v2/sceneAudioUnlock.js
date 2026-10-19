import { unlockSpeech } from './linePlayback.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import { strace, straceOutcome } from '../../../shared/lib/soundGestureTrace.js'

// Переключатель для быстрого отката. false (по умолчанию): на iOS жест «Включить звук» на ВИДЕО-слайде НЕ трогает
// аудио сцен (тихий wav + speechSynthesis.speak(' ') на iOS могут перехватить аудиосессию и оставить <video> без звука) —
// их открывает первый жест на слайде-сцене. true — прежнее поведение (v3.2.1996): сцены открываются тем же жестом, что и видео.
// Вне iOS (Chrome: жест страницы «липкий») разницы нет, там всегда как раньше
export const SCENE_AUDIO_EAGER_UNLOCK = false

export function isIosWebKit() {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Откладываем ли открытие аудио сцен до жеста на слайде-сцене
export const sceneUnlockDeferred = () => !SCENE_AUDIO_EAGER_UNLOCK && isIosWebKit()

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

const listeners = new Set()
const emit = () => listeners.forEach(fn => fn())
export function subscribeSceneAudio(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function unlockOne(a, label) {
  a.muted = false
  a.src = SILENCE
  const p = a.play()
  straceOutcome(label, p, a)
  if (p?.then) p.then(() => a.pause(), () => { unlocked = false; emit() })
}

// Зовётся только из обработчика пользовательского жеста
export function unlockSceneAudio() {
  strace('аудио сцен: unlockSpeech (speechSynthesis.speak)')
  unlockSpeech()
  const a = getSceneAudioElement()
  if (!a || unlocked) return
  try {
    unlockOne(a, 'аудио сцен (общий <audio>)')
    unlocked = true
    if (!spare && !isWeakDevice()) spare = makeAudio()
    if (spare) unlockOne(spare, 'аудио сцен (spare)')
  } catch {
    unlocked = false
  }
  emit()
}

// Жест на ВИДЕО-слайде / в шапке: открывает аудио сцен, только если это безопасно (см. SCENE_AUDIO_EAGER_UNLOCK)
export function unlockSceneAudioFromVideoGesture() {
  if (sceneUnlockDeferred()) {
    strace('аудио сцен: пропущено на жесте видео (iOS, отложено до жеста на слайде-сцене)')
    return false
  }
  unlockSceneAudio()
  return true
}

// Слайду-сцене нужен свой жест: звук включён, но аудио сцен ещё не открыто, а открывать его надо именно жестом на сцене
export const sceneNeedsOwnGesture = () => !unlocked && sceneUnlockDeferred()

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
  emit()
}

// Жест запуска УРОКА (карточка запуска, ▶ в канвасе): открывает аудио сцен, только если в уроке есть нода scene — на iOS это тихий wav +
// speechSynthesis.speak(' ') в самом тапе, иначе кружок/сцена в начале урока стартует без звука (политика автоплея)
export function unlockSceneAudioForLesson(nodes) {
  if (Array.isArray(nodes) && nodes.some(n => n?.type === 'scene')) unlockSceneAudio()
}
