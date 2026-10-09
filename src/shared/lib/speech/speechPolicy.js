// Правила попытки распознавания (общие для пробы «Голос» и модуля «Сказать фразу»): таймеры, автоповторы, тексты статусов. Чистые данные и функции.

export const LISTEN_SILENCE_MS = 8000   // тишина после реального начала записи (audiostart) → «Не слышу речь»
export const PERMISSION_GUARD_MS = 30000 // от тапа до audiostart: пока висит диалог разрешения микрофона
export const MAX_ATTEMPTS = 3           // всего попыток в одном нажатии «Сказать» (первая + 2 автоповтора)
export const RETRY_PAUSE_MS = 700       // пауза перед автоповтором
export const STOP_FORCE_MS = 2500       // iOS иногда не присылает end после stop()/результата — закрываем сами
export const SEGMENT_SILENCE_MS = 1200  // режим continuous (эксперимент «По словам»): столько тишины после последнего результата — конец
// Второй запуск на iOS: аудиосессия прошлого экземпляра освобождается не сразу, новый «глухой» (audiostart за ~50 мс, звука нет). См. speechRestart.js, speechDeaf.js
export const RESTART_COOLDOWN_MS = 600  // модуль «Сказать фразу»: следующий запуск — только после end прошлого экземпляра + столько
export const DEAF_AUDIO_MS = 120        // audiostart быстрее этого (при нормальных 450–1400 мс) — признак «глухой» сессии
export const DEAF_WINDOW_MS = 4000      // и за столько после audiostart нет ни soundstart, ни speechstart, ни результата
export const DEAF_RETRY_PAUSE_MS = 900  // авто-восстановление: пауза перед новым экземпляром
export const DEAF_RETRY_MAX = 2         // сколько раз подряд пересоздаём «глухую» сессию (новый экземпляр + сброс audioSession + пауза), потом сдаёмся

// Ошибки, после которых автоповтор имеет смысл (связь, тишина, системный abort).
// not-allowed / audio-capture / language-not-supported / start-failed / no-start — нужно действие пользователя.
const RETRYABLE = new Set(['network', 'no-speech', 'silence', 'service-not-allowed', 'aborted', 'deaf'])

/** retry — номер упавшей попытки с нуля (0 = первая) */
export function shouldRetry(code, retry, max = MAX_ATTEMPTS) {
  return RETRYABLE.has(code) && retry + 1 < max
}

export const isQuietCode = code => code === 'no-speech' || code === 'silence'

export const LOUD_HINT = 'Говорите громче и ближе к микрофону.'

/** Статус между попытками: «Слабая связь, пробуем ещё раз (2 из 3)…» */
export function retryNotice(code, nextNo, max = MAX_ATTEMPTS) {
  const why = code === 'network' ? 'Слабая связь' : code === 'deaf' ? 'Микрофон не отвечает' : isQuietCode(code) ? 'Не слышу речь' : 'Не получилось'
  return `${why}, пробуем ещё раз (${nextNo} из ${max})…`
}

export const NOTICE_PREPARE = 'Подготовка микрофона…'
export const NOTICE_WAIT_PERMISSION = 'Ждём разрешение микрофона…'
export const NOTICE_BLOCKED = 'Браузер не дал запустить автоповтор без нажатия — нажмите «Ещё раз».'

/** 0..1 → целые проценты; null/не число → null */
export const toPercent = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 100) : null)

/**
 * Что делать после завершённой попытки (чистое решение для speechController): повторить (kind 'retry': pause, notice, lastError, viaDeaf) или закончить заход
 * (kind 'final': patch для view). viaDeaf — «глухая» попытка после успешной/глухой (wasHot): новый экземпляр с увеличенной паузой, не больше DEAF_RETRY_MAX раз
 * за заход (deafRetries — сколько уже было; deaf_retry в журнале).
 * lastError — ошибка, из-за которой шли повторы (если автоповтор вне жеста iOS не запустится, показываем её)
 */
export function planNext({ outcome, error, retry, deaf = false, wasOk = false, deafRetries = 0, lastError = null }) {
  if (outcome === 'error' && shouldRetry(error, retry)) {
    const viaDeaf = deaf && wasOk && deafRetries < DEAF_RETRY_MAX
    return {
      kind: 'retry', viaDeaf, lastError: viaDeaf ? 'no-speech' : error,
      pause: viaDeaf ? Math.max(RETRY_PAUSE_MS, DEAF_RETRY_PAUSE_MS) : RETRY_PAUSE_MS, notice: retryNotice(viaDeaf ? 'deaf' : error, retry + 2),
    }
  }
  if (outcome !== 'error') return { kind: 'final', patch: { status: 'done', error: null, hint: null, notice: null } }
  if (error === 'start-failed' && retry > 0) { // автоповтор вне жеста браузер не дал запустить (iOS): честно просим нажать
    const prev = lastError || error
    return { kind: 'final', patch: { status: 'error', error: prev, hint: isQuietCode(prev) ? LOUD_HINT : null, notice: NOTICE_BLOCKED, needTap: true } }
  }
  return { kind: 'final', patch: { status: 'error', error, hint: isQuietCode(error) ? LOUD_HINT : null, notice: null } }
}
