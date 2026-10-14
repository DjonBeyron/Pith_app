// Лимит времени на ответ (поле ноды timeLimitSec у word_choice и phrase_assembly). Чистые функции, без React.
export const TIME_LIMIT_MIN = 3
export const TIME_LIMIT_MAX = 60

/** Секунды из поля ноды → число в допустимых границах или null (поля нет, мусор, 0 — без таймера) */
export function readTimeLimit(raw) {
  const n = Math.round(Number(raw))
  if (raw == null || raw === '' || !Number.isFinite(n) || n <= 0) return null
  return Math.min(TIME_LIMIT_MAX, Math.max(TIME_LIMIT_MIN, n))
}
