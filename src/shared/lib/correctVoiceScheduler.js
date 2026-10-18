import { playSound, onSoundPlayed } from './sounds.js'

// Верный ответ: сначала звук интерфейса (answer-correct), потом озвучка фразы. Ждать конца звука не нужно — озвучка стартует,
// когда звук доиграл примерно до VOICE_START_AT своей длительности: хвост «верно» и начало голоса идут внахлёст, без паузы.
// Одна функция на все модули, где ответ озвучивается сам (напечатай слово, собери фразу, выбери слово).
export const VOICE_START_AT = 0.65
const UNKNOWN_DURATION_MS = 350 // звук пошёл, но длительность ещё неизвестна (метаданные не пришли)
const NOT_STARTED_MS = 600      // звук так и не пошёл (тишина, выключен в настройках, окно записи): озвучку не держим

/**
 * where — подпись для лога звука. startVoice — запуск озвучки (playWord…); без него просто играет звук.
 * Возвращает cancel(): снимает ещё не запущенную озвучку.
 */
export function playCorrectWithVoice(where, startVoice, { name = 'answer-correct', startAt = VOICE_START_AT } = {}) {
  if (typeof startVoice !== 'function') { playSound(name, where); return () => {} }
  let fired = false
  let timer = 0
  let off = null
  const stop = () => { clearTimeout(timer); off?.(); off = null }
  const fire = () => { if (fired) return; fired = true; stop(); startVoice() }
  off = onSoundPlayed((n, durationSec) => {
    if (n !== name || fired) return
    off?.(); off = null
    clearTimeout(timer)
    timer = setTimeout(fire, durationSec > 0 ? durationSec * 1000 * startAt : UNKNOWN_DURATION_MS)
  })
  timer = setTimeout(fire, NOT_STARTED_MS)
  playSound(name, where)
  return () => { fired = true; stop() }
}
