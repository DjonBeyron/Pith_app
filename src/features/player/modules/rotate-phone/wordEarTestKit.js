// Стенд тестов правила слова (wordEarRule.test.js, wordEarPhones.test.js): настоящий слушатель слов с правилом, сеанс Vosk ведёт тест, часы и уровень — ручные. Не тест и не код приложения.
import { createWordListener } from './wordLaneListen.js'
import { QUIET_MS } from './wordEarRule.js'

export const CHUNK = 46
export const NOISE = 0.0002 // фон микрофона iPhone
export function rig({ targets = ['wonderful'], lang = 'en', earRule = true, expected = 1, noise = NOISE, stream = false } = {}) {
  let t = 0
  const timers = new Map(); let id = 0
  const sessions = [], seen = [], logs = []
  const listen = async (model, grammar, cb) => { const s = { cb, stops: [], grammar: JSON.parse(grammar) }; sessions.push(s); cb.onReady?.(); return { stop(why) { s.stops.push(why ?? null) }, cancel() {} } }
  const l = createWordListener({
    targets, expected, maxWords: 2, lang, earRule, listen, ...(stream ? { getStream: () => ({}) } : {}), runtime: { getModel: () => 'M', snapshot: () => ({}) }, onChange: s => seen.push(s), onDebug: (k, d) => { if (k === 'ear') logs.push(d.text) }, now: () => t,
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id }, clearTimer: k => timers.delete(k),
  })
  const advance = ms => { t += ms; for (const [k, x] of [...timers]) if (x.at <= t) { timers.delete(k); x.fn() } }
  const cur = () => sessions.at(-1)
  const voice = (ms, rms = 0.2) => { for (let k = 0; k < ms; k += CHUNK) { cur().cb.onLevel(rms); advance(CHUNK) } }
  const still = (ms = QUIET_MS + CHUNK) => voice(ms, noise)
  const open = async () => { l.start(); await new Promise(r => setTimeout(r, 0)); still(300) } // заход открыт, правило услышало фон
  return { l, sessions, seen, logs, advance, voice, still, open, cur, hits: () => seen.at(-1)?.seq.length ?? 0 }
}
export const W = (word, conf = 1, start = 0.3, end = 0.9) => ({ word, conf, start, end })
