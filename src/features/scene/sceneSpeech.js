// Озвучка реплик сцены через window.speechSynthesis (временно, до ElevenLabs + wordTimings).
// Если синтеза нет или нет русского голоса — запасной таймер по длине текста:
// анимация рта всё равно идёт, реплика «длится» ~65 мс на символ.

export const MS_PER_CHAR = 65

export function fallbackMs(text, rate = 1) {
  const base = Math.max(1200, text.length * MS_PER_CHAR + 500)
  return Math.round(base / Math.max(0.3, rate || 1))
}

export function speechSupported() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function'
}

export function pickRuVoice() {
  if (!speechSupported()) return null
  const voices = window.speechSynthesis.getVoices() || []
  const ru = voices.filter(v => /^ru(-|_|$)/i.test(v.lang || ''))
  if (!ru.length) return null
  // Предпочитаем локальный голос (на iPhone — Milena), иначе первый русский
  return ru.find(v => v.localService) || ru.find(v => /milena|yuri|google/i.test(v.name)) || ru[0]
}

// Статус для стенда: 'none' — синтеза нет, 'loading' — список голосов ещё пуст,
// 'no-ru' — голоса есть, русского нет, 'ru' — русский голос найден
export function voiceStatus() {
  if (!speechSupported()) return 'none'
  const voices = window.speechSynthesis.getVoices() || []
  if (!voices.length) return 'loading'
  return pickRuVoice() ? 'ru' : 'no-ru'
}

export function onVoicesChanged(fn) {
  if (!speechSupported()) return () => {}
  window.speechSynthesis.addEventListener?.('voiceschanged', fn)
  return () => window.speechSynthesis.removeEventListener?.('voiceschanged', fn)
}

// iOS/Safari разрешают speak() только после жеста пользователя: пустая реплика
// из обработчика тапа «разблокирует» синтез для следующих вызовов из эффектов
export function unlockSpeech() {
  if (!speechSupported()) return
  try {
    const u = new window.SpeechSynthesisUtterance(' ')
    u.volume = 0
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* не критично */ }
}

function timerSpeak(text, rate, { onBoundary, onEnd }) {
  const total = fallbackMs(text, rate)
  const words = text.split(/\s+/).filter(Boolean).length || 1
  const step = Math.max(120, Math.floor(total / (words + 1)))
  const tick = setInterval(() => onBoundary?.(), step)
  const end = setTimeout(() => { clearInterval(tick); onEnd?.() }, total)
  return () => { clearInterval(tick); clearTimeout(end) }
}

// Проиграть одну реплику. Возвращает функцию отмены (после отмены onEnd не зовётся).
// voice: { pitch, rate }, sound: false → всегда таймер. onMode('speech' | 'timer')
export function speakLine(text, voice, { sound = true, onBoundary, onEnd, onMode } = {}) {
  const rate = voice?.rate ?? 1
  const ruVoice = sound && speechSupported() ? pickRuVoice() : null
  if (!ruVoice) {
    onMode?.('timer')
    return timerSpeak(text, rate, { onBoundary, onEnd })
  }
  onMode?.('speech')

  let finished = false
  let cancelled = false
  const u = new window.SpeechSynthesisUtterance(text)
  u.lang = 'ru-RU'
  u.voice = ruVoice
  u.pitch = voice?.pitch ?? 1
  u.rate = rate

  // Страховка: Chrome иногда «теряет» утверждение и не шлёт ни end, ни error
  const guard = setTimeout(() => finish(), fallbackMs(text, rate) * 2.5)
  function finish() {
    if (finished || cancelled) return
    finished = true
    clearTimeout(guard)
    onEnd?.()
  }
  u.onend = finish
  u.onerror = finish
  u.onboundary = (e) => { if (!e.name || e.name === 'word') onBoundary?.() }

  try {
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch {
    clearTimeout(guard)
    onMode?.('timer')
    return timerSpeak(text, rate, { onBoundary, onEnd })
  }

  return () => {
    cancelled = true
    clearTimeout(guard)
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
  }
}
