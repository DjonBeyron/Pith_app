// Запасная озвучка реплики (когда у реплики нет audioUrl): speechSynthesis
// с границами слов либо таймер по длине текста (~65 мс/символ) — рот
// двигается в любом случае. Язык синтеза — по тексту (detectLang): латиница → en-US (оригинал уроков английского),
// кириллица → ru-RU (перевод, старые русские сцены); голос подбирается ТОГО ЖЕ языка. Самостоятельная копия подхода стенда: v2 не
// зависит от файлов стенда (?scene=1), чтобы тот жил независимо.

import { sceneTrace, shortText } from './sceneTrace.js'

export const MS_PER_CHAR = 65

export function fallbackMs(text, rate = 1) {
  const base = Math.max(1200, (text?.length ?? 0) * MS_PER_CHAR + 500)
  return Math.round(base / Math.max(0.3, rate || 1))
}

export function speechSupported() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function'
}

// Язык текста для синтеза: кириллицы больше, чем латиницы → ru-RU, иначе en-US
export function detectLang(text) {
  const t = String(text ?? '')
  const ru = (t.match(/[А-Яа-яЁё]/g) || []).length
  const en = (t.match(/[A-Za-z]/g) || []).length
  return ru > en ? 'ru-RU' : 'en-US'
}

const VOICE_NAMES = { ru: /milena|yuri|google/i, en: /samantha|google (us|uk)|daniel|alex|zira|david|aaron/i }

// Голос устройства для языка lang ('en-US' | 'ru-RU'); voiceId — точное совпадение по voiceURI/имени, если оно есть и язык тот же
export function pickVoiceFor(lang, voiceId) {
  if (!speechSupported()) return null
  const prefix = String(lang || 'ru-RU').slice(0, 2).toLowerCase()
  const voices = window.speechSynthesis.getVoices() || []
  const same = voices.filter(v => String(v.lang || '').toLowerCase().replace('_', '-').startsWith(prefix))
  if (voiceId) {
    const exact = same.find(v => v.voiceURI === voiceId || v.name === voiceId)
    if (exact) return exact
  }
  if (!same.length) return null
  const exactLang = same.filter(v => String(v.lang).toLowerCase().replace('_', '-') === String(lang).toLowerCase())
  const pool = exactLang.length ? exactLang : same
  return pool.find(v => v.localService) || pool.find(v => (VOICE_NAMES[prefix] || VOICE_NAMES.ru).test(v.name)) || pool[0]
}

export const pickRuVoice = voiceId => pickVoiceFor('ru-RU', voiceId)

// Таймер: onWord примерно на каждое слово, onEnd по расчётной длительности
export function timerSpeak(text, rate, { onWord, onEnd }, timers = globalThis) {
  const total = fallbackMs(text, rate)
  const words = (text ?? '').split(/\s+/).filter(Boolean).length || 1
  const step = Math.max(120, Math.floor(total / (words + 1)))
  const tick = timers.setInterval(() => onWord?.(), step)
  const end = timers.setTimeout(() => { timers.clearInterval(tick); onEnd?.() }, total)
  return () => { timers.clearInterval(tick); timers.clearTimeout(end) }
}

// iOS/Safari: speak() разрешён только после жеста — пустая реплика из тапа
// открывает синтез для следующих вызовов из эффектов
export function unlockSpeech() {
  if (!speechSupported()) return
  try {
    const u = new window.SpeechSynthesisUtterance(' ')
    u.volume = 0
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* не критично */ }
}

// Единственный синтез на странице: speechSynthesis общий для всех сцен. Свой cancel() отменяет ТОЛЬКО свою
// реплику: прерванная сцена, ставясь на паузу уже после старта другой, иначе гасила бы чужой голос
// (у той onerror → «реплика кончилась» → следующая реплика проскакивала без озвучки)
let activeUtterance = null

// Проиграть реплику без файла. voice: { pitch, rate, voiceId? }; sound=false →
// всегда таймер. lang — язык синтеза ('en-US' | 'ru-RU'; по умолчанию detectLang(text)).
// onMode('speech' | 'timer'). Возвращает cancel().
export function speakFallback(text, voice, { sound = true, lang = null, onWord, onEnd, onMode } = {}) {
  const rate = voice?.rate ?? 1
  const speechLang = lang || detectLang(text)
  const deviceVoice = sound && speechSupported() ? pickVoiceFor(speechLang, voice?.voiceId) : null
  if (!deviceVoice) {
    sceneTrace(`таймер «${shortText(text)}»: ${!sound ? 'без звука' : !speechSupported() ? 'speechSynthesis нет' : `нет голоса ${speechLang}`} (${fallbackMs(text, rate)} мс)`)
    onMode?.('timer')
    return timerSpeak(text, rate, { onWord, onEnd })
  }
  sceneTrace(`синтез «${shortText(text)}»: ${speechLang} голос=${deviceVoice.name ?? '?'} rate=${rate}`)
  onMode?.('speech')

  let finished = false
  let cancelled = false
  const u = new window.SpeechSynthesisUtterance(text)
  u.lang = speechLang
  u.voice = deviceVoice
  u.pitch = voice?.pitch ?? 1
  u.rate = rate

  // Chrome иногда «теряет» утверждение и не шлёт ни end, ни error — страховка
  const guard = setTimeout(() => finish(), fallbackMs(text, rate) * 2.5)
  function finish() {
    if (finished || cancelled) return
    finished = true
    clearTimeout(guard)
    if (activeUtterance === u) activeUtterance = null
    onEnd?.()
  }
  u.onend = finish
  // Нас вытеснил чужой speak() (другая сцена): это не конец реплики — сцену сейчас поставят на паузу (страховка guard — на случай, если нет)
  u.onerror = e => {
    sceneTrace(`синтез «${shortText(text)}»: onerror ${e?.error ?? ''} ${activeUtterance === null || activeUtterance === u ? '→ конец реплики' : '(вытеснен чужим speak, ждём)'}`)
    if (activeUtterance === null || activeUtterance === u) finish()
  }
  u.onboundary = (e) => { if (!e.name || e.name === 'word') onWord?.() }

  try {
    window.speechSynthesis.cancel()
    activeUtterance = u
    window.speechSynthesis.speak(u)
  } catch {
    clearTimeout(guard)
    onMode?.('timer')
    return timerSpeak(text, rate, { onWord, onEnd })
  }
  return () => {
    cancelled = true
    clearTimeout(guard)
    if (activeUtterance !== u) return
    activeUtterance = null
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
  }
}
