// Правила попытки распознавания (общие для пробы «Голос» и модуля «Сказать фразу»): таймеры, автоповторы, тексты статусов. Чистые данные и функции.

export const LISTEN_SILENCE_MS = 8000   // тишина после реального начала записи (audiostart) → «Не слышу речь»
export const PERMISSION_GUARD_MS = 30000 // от тапа до audiostart: пока висит диалог разрешения микрофона
export const MAX_ATTEMPTS = 3           // всего попыток в одном нажатии «Сказать» (первая + 2 автоповтора)
export const RETRY_PAUSE_MS = 700       // пауза перед автоповтором
export const STOP_FORCE_MS = 2500       // iOS иногда не присылает end после stop()/результата — закрываем сами

// Ошибки, после которых автоповтор имеет смысл (связь, тишина, системный abort).
// not-allowed / audio-capture / language-not-supported / start-failed / no-start — нужно действие пользователя.
const RETRYABLE = new Set(['network', 'no-speech', 'silence', 'service-not-allowed', 'aborted'])

/** retry — номер упавшей попытки с нуля (0 = первая) */
export function shouldRetry(code, retry, max = MAX_ATTEMPTS) {
  return RETRYABLE.has(code) && retry + 1 < max
}

export const isQuietCode = code => code === 'no-speech' || code === 'silence'

export const LOUD_HINT = 'Говорите громче и ближе к микрофону.'

/** Статус между попытками: «Слабая связь, пробуем ещё раз (2 из 3)…» */
export function retryNotice(code, nextNo, max = MAX_ATTEMPTS) {
  const why = code === 'network' ? 'Слабая связь' : isQuietCode(code) ? 'Не слышу речь' : 'Не получилось'
  return `${why}, пробуем ещё раз (${nextNo} из ${max})…`
}

export const NOTICE_WAIT_PERMISSION = 'Ждём разрешение микрофона…'
export const NOTICE_BLOCKED = 'Браузер не дал запустить автоповтор без нажатия — нажмите «Ещё раз».'

/** 0..1 → целые проценты; null/не число → null */
export const toPercent = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 100) : null)
