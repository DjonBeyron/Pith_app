// Запасная озвучка реплики (когда у реплики нет audioUrl): speechSynthesis
// ru-RU с границами слов либо таймер по длине текста (~65 мс/символ) — рот
// двигается в любом случае. Самостоятельная копия подхода стенда: v2 не
// зависит от файлов стенда (?scene=1), чтобы тот жил независимо.

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

export function pickRuVoice(voiceId) {
  if (!speechSupported()) return null
  const voices = window.speechSynthesis.getVoices() || []
  if (voiceId) {
    const exact = voices.find(v => v.voiceURI === voiceId || v.name === voiceId)
    if (exact) return exact
  }
  const ru = voices.filter(v => /^ru(-|_|$)/i.test(v.lang || ''))
  if (!ru.length) return null
  return ru.find(v => v.localService) || ru.find(v => /milena|yuri|google/i.test(v.name)) || ru[0]
}

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

// Проиграть реплику без файла. voice: { pitch, rate, voiceId? }; sound=false →
// всегда таймер. onMode('speech' | 'timer'). Возвращает cancel().
export function speakFallback(text, voice, { sound = true, onWord, onEnd, onMode } = {}) {
  const rate = voice?.rate ?? 1
  const ruVoice = sound && speechSupported() ? pickRuVoice(voice?.voiceId) : null
  if (!ruVoice) {
    onMode?.('timer')
    return timerSpeak(text, rate, { onWord, onEnd })
  }
  onMode?.('speech')

  let finished = false
  let cancelled = false
  const u = new window.SpeechSynthesisUtterance(text)
  u.lang = 'ru-RU'
  u.voice = ruVoice
  u.pitch = voice?.pitch ?? 1
  u.rate = rate

  // Chrome иногда «теряет» утверждение и не шлёт ни end, ни error — страховка
  const guard = setTimeout(() => finish(), fallbackMs(text, rate) * 2.5)
  function finish() {
    if (finished || cancelled) return
    finished = true
    clearTimeout(guard)
    onEnd?.()
  }
  u.onend = finish
  u.onerror = finish
  u.onboundary = (e) => { if (!e.name || e.name === 'word') onWord?.() }

  try {
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch {
    clearTimeout(guard)
    onMode?.('timer')
    return timerSpeak(text, rate, { onWord, onEnd })
  }
  return () => {
    cancelled = true
    clearTimeout(guard)
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
  }
}
