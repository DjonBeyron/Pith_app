// Для тестов слушателя фраз этапа 2 (racePhraseListen.test.js, racePhraseListenThrough.test.js, racePhraseListenPass1.test.js; wordByWord — проход 1): подставной распознаватель (как в wordLaneRuListen.test.js) — partial / result подаются руками,
// таймеры ручные (advance), фразы-кандидаты P.
import { createPhraseListener } from './racePhraseListen.js'
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'

export const P = {
  meet: { key: 'nice to meet you', words: ['nice', 'to', 'meet', 'you'] },
  from: { key: 'where are you from', words: ['where', 'are', 'you', 'from'] },
  learn: { key: "i'm trying to learn", words: ["I'm", 'trying', 'to', 'learn'] },
  see: { key: 'nice to see you', words: ['nice', 'to', 'see', 'you'] },
}
export function rig(phrases, { held = () => false, noModel = false, wordByWord = false } = {}) {
  let t = 0
  const timers = new Map(); let id = 0
  const sessions = [], words = [], got = [], logs = [], errors = [], hears = []
  const now = () => t
  const setTimer = (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id }
  const clearTimer = k => timers.delete(k)
  const listen = async (model, grammar, cb, opts) => { const s = { cb, grammar, opts, stopped: 0, cancelled: 0 }; sessions.push(s); cb.onReady?.(); return { stop() { s.stopped++ }, cancel() { s.cancelled++ } } }
  const runtime = { getModel: () => (noModel ? null : 'M'), snapshot: () => ({}) }
  const l = createPhraseListener({
    phrases, getStream: () => null, isHeld: held, wordByWord, onWord: w => words.push(w), onEar: e => hears.push(e), onPhrase: p => got.push(p), onError: e => errors.push(e), log: s => logs.push(s),
    create: o => createWordListener({ ...o, listen, runtime, now, setTimer, clearTimer }), now, setTimer, clearTimer,
  })
  const advance = ms => { t += ms; for (const [k, x] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (x.at <= t && timers.has(k)) { timers.delete(k); x.fn() } }
  return { l, sessions, words, got, logs, errors, hears, advance, cur: () => sessions.at(-1) }
}
export const flush = () => new Promise(r => setTimeout(r, 0))
export const end = async (r, text, ms = 200) => { r.cur().cb.onResult(text, { words: [] }); r.advance(ms); await flush() }
