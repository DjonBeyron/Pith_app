import { unlockSpeech } from './linePlayback.js'

// Разблокировка звука сцены ИЗ ЖЕСТА (тап «▶ Старт», тап по сцене) — тот же
// приём, что primedAudio.js / unlockLessonAudio в уроке: автозапуск на iOS
// разрешается конкретному media-элементу, который хоть раз стартовал в жесте.
// Держим один <audio> на все сцены, греем его беззвучным wav без muted
// (приглушённый play ничего не открывает), и дальше реплики с audioUrl
// играют через него уже из эффектов. Параллельно открываем speechSynthesis.

const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

let el = null
let unlocked = false

export function getSceneAudioElement() {
  if (typeof document === 'undefined') return null
  if (el) return el
  el = document.createElement('audio')
  el.setAttribute('playsinline', '')
  el.preload = 'auto'
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

// Зовётся только из обработчика пользовательского жеста
export function unlockSceneAudio() {
  unlockSpeech()
  const a = getSceneAudioElement()
  if (!a || unlocked) return
  try {
    a.muted = false
    a.src = SILENCE
    const p = a.play()
    unlocked = true
    if (p?.then) p.then(() => a.pause(), () => { unlocked = false })
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
  el = null
  unlocked = false
}
