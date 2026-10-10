// Что было с «голосовым» на ПОСЛЕДНЕЙ попытке «Сказать фразу» — для админской строки диагностики («Голосовое: режим ноды вкл/выкл; последняя попытка: записано N.N с / нет (причина)»).
// Модульная переменная, как sayEngineLast.js; звука здесь нет — только число секунд и причина.
export const VOICE_REASON = {
  off: 'режим ноды выключен', system: 'распознавало системное, не Vosk', 'no-audio': 'запись не получена', silent: 'в записи тишина', short: 'запись слишком короткая',
  empty: 'в записи нет звука', error: 'ошибка сборки записи', limit: 'не вошла в лимит памяти сессии',
}
let last = null
export const setVoiceAttempt = a => { last = a ? { ...a, at: Date.now() } : null }
export const getVoiceAttempt = () => last

/** Строка диагностики: { level: 'ok'|'info'|'warn', text }. nodeOn — режим включён в ноде сейчас (даже если попыток ещё не было) */
export function voiceRow(nodeOn, attempt = last) {
  if (!nodeOn) return { level: 'info', text: 'режим ноды выкл' }
  const mode = 'режим ноды вкл'
  if (!attempt) return { level: 'info', text: `${mode}; последняя попытка: ещё не было` }
  if (attempt.ok) return { level: 'ok', text: `${mode}; последняя попытка: записано ${(attempt.ms / 1000).toFixed(1).replace('.', ',')} с` }
  const why = VOICE_REASON[attempt.reason] ?? attempt.reason ?? 'неизвестно'
  return { level: attempt.reason === 'off' ? 'info' : 'warn', text: `${mode}; последняя попытка: нет (${why})` }
}
