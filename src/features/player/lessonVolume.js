import { useEffect, useSyncExternalStore } from 'react'

// Звук урока из шапки (LessonVolumeButtons.jsx): «без звука» и скорость голоса.
//
// «Без звука» — тотальный mute урока: голосовые, диктор таблиц, озвучка слов,
// видео/кружки/стикеры и звуки интерфейса молчат, но всё ИГРАЕТ как обычно —
// таймеры, спектр, печать текста, события ended и переходы к следующей ноде
// не меняются (у <audio>/<video> ставится muted, а не pause; на iOS громкость
// медиа-элемента не регулируется, muted — единственное, что там работает).
// Объединяется с «Не могу слушать» колоды повторения в playerMuted.js:
// итоговое muted = muted повторения || mute урока.
//
// Скорость голоса — только речь: голосовые (AudioModule), диктант таблиц
// (TableDictatorPanel: таймлайн ведётся по currentTime и ускоряется сам),
// озвучка слов (wordAudioPlayer). Звуки интерфейса и видео не трогаем.
// Тембр сохраняется (preservesPitch) — голос не «мультяшный».
//
// Чистое состояние без React внутри + подписка useSyncExternalStore: читать
// можно и из модулей без React (wordAudioPlayer, таймеры диктанта).
// Хранится в localStorage, общее для всех уроков, переживает перезапуск.
export const MUTED_KEY  = 'pithy_lesson_muted'
export const RATE_KEY   = 'pithy_voice_rate'
export const VOICE_RATES = [0.75, 1, 1.25, 1.5, 2]

function readStore(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value) } catch { /* приватный режим / нет storage */ }
}

// Любое число → ближайший разрешённый вариант; мусор → 1×
export function clampVoiceRate(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 1
  return VOICE_RATES.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best), VOICE_RATES[0])
}

let muted = readStore(MUTED_KEY) === '1'
let rate  = clampVoiceRate(readStore(RATE_KEY) ?? 1)
const listeners = new Set()
function emit() { listeners.forEach(fn => fn()) }

export function subscribeLessonVolume(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getLessonMuted() { return muted }
export function setLessonMuted(value) {
  const next = !!value
  if (next === muted) return
  muted = next
  writeStore(MUTED_KEY, next ? '1' : '0')
  emit()
}

export function getVoiceRate() { return rate }
export function setVoiceRate(value) {
  const next = clampVoiceRate(value)
  if (next === rate) return
  rate = next
  writeStore(RATE_KEY, String(next))
  emit()
}

export function useLessonMuted() {
  return useSyncExternalStore(subscribeLessonVolume, getLessonMuted, getLessonMuted)
}
export function useVoiceRate() {
  return useSyncExternalStore(subscribeLessonVolume, getVoiceRate, getVoiceRate)
}

// Скорость речи на медиа-элементе. preservesPitch — до смены rate: Safari
// иначе успевает поставить «чипманка» на первый кадр
export function applyVoiceRate(el, r = rate) {
  if (!el) return
  try {
    el.preservesPitch = true
    el.webkitPreservesPitch = true
    el.playbackRate = r
  } catch { /* элемент мог быть выгружен */ }
}

// Полный набор для ведущего элемента диктанта: <audio> панели, прогретый
// элемент (primedAudio.js) или часы (silentClock.js — у них своя setRate и
// глушить нечего). extraMuted — muted из контекста плеера (повторение)
export function applyLessonVolume(el, extraMuted = false) {
  if (!el) return
  if (typeof el.setRate === 'function') { el.setRate(rate); return }
  try { el.muted = extraMuted || muted } catch { /* ignore */ }
  applyVoiceRate(el)
}

// Браузер сбрасывает playbackRate при смене источника (алгоритм загрузки
// медиа: rate ← defaultPlaybackRate), и ставить его один раз после маунта
// мало — на стенде голосовое после подмены ссылка→blob играло 1× при
// выбранных 2×. Повторяем на метаданных и на каждом старте
export function listenMediaReapply(el, apply) {
  if (!el || typeof el.addEventListener !== 'function') return () => {}
  el.addEventListener('loadedmetadata', apply)
  el.addEventListener('play', apply)
  return () => {
    el.removeEventListener('loadedmetadata', apply)
    el.removeEventListener('play', apply)
  }
}

// Голосовое сообщение: скорость на его <audio> — сразу и при каждой смене.
// deps — когда элемент пересоздаётся (src, elKey в AudioModule)
export function useMediaVoiceRate(ref, deps = []) {
  useEffect(() => {
    const apply = () => applyVoiceRate(ref.current)
    apply()
    const offEvents = listenMediaReapply(ref.current, apply)
    const offStore = subscribeLessonVolume(apply)
    return () => { offStore(); offEvents() }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
