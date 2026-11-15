// Что писать в журнал в момент, когда система заглушила / оборвала дорожку микрофона (gameJournalPage.js): само событие мало что объясняет —
// важно, что происходило ЗА СЕКУНДЫ ДО него (старт реплики, окно речи mic-hold, смена типа сессии, возврат из фона). Берём хвост журнала
// (без шумных [perf] / [suspects]) и подробности звука (gameAudioPulse.audioDeep). Журнал и источники подставляются (тесты).
import { audioPulse, audioDeep } from './gameAudioPulse.js'
import { peekGameMic } from './gameMic.js'

export const TAIL_MS = 3000
export const TAIL_LINES = 14
const NOISE = /\[(perf|suspects)\]/

/** Строки журнала за последние windowMs (метка в начале строки — performance.now), без шума; не больше max, самые свежие, сжатые до 170 символов */
export function journalTail(lines, nowMs, { windowMs = TAIL_MS, max = TAIL_LINES } = {}) {
  const out = []
  for (let i = lines.length - 1; i >= 0 && out.length < max; i--) {
    const t = Number.parseFloat(lines[i].slice(0, 9))
    if (Number.isFinite(t) && nowMs - t > windowMs) break
    if (!NOISE.test(lines[i])) out.push(lines[i].trim().slice(0, 170))
  }
  return out.reverse()
}

/** Дописать в журнал разбор глушения: пульс звука, подробности и хвост «что было до». kind — 'mute' | 'ended' */
export function reportMicLoss(journal, kind, { now = () => globalThis.performance?.now?.() ?? Date.now(), pulse = audioPulse, deep = () => audioDeep({ stream: peekGameMic() }) } = {}) {
  try {
    const at = now()
    const tail = journalTail(journal.lines(), at) // хвост берём до своих строк
    journal.add(`[mute-разбор] ${kind === 'ended' ? 'дорожка оборвана' : 'дорожка заглушена'}: ${pulse()}`)
    for (const l of deep()) journal.add(`[mute-разбор]   ${l}`)
    journal.add(`[mute-разбор] что было за ${TAIL_MS / 1000} с до этого (${tail.length} строк):`)
    for (const l of tail) journal.add(`[mute-разбор]   ← ${l}`)
  } catch { /* журнал не мешает игре */ }
}
