import { describe, it, expect } from 'vitest'
import { createGame2Listener, grammarMax, phrasesCount, GRAMMAR_PHRASES, GRAMMAR_MAX } from './game2Listen.js'
import { createMicDebug } from './game2MicLog.js'
import { createMicHold } from '../../shared/lib/gameMicHold.js'
import { runLane } from './game2Lane.js'
import { MODES } from './game2Modes.js'
import { buildTimeline, phraseWords, dueFlags, timingsOf } from './timelinePlan.js'
import { planFor } from '../rehearsal/rehearsalFixtures.js'

// Подключение слушателя: настоящий createWordListener на подставных модели и распознавателе (listen) — проверяем, что получает Vosk (словарь, потоки, момент старта), и что обёртка отдаёт слова.
const plan = planFor('sim', { fixture: 'three' })
const words = phraseWords(plan) // ["I'm", 'trying', 'to', 'learn']

function rig(extra = {}) {
  const calls = []
  const sessions = []
  const heard = []
  const statuses = []
  const listen = (model, grammar, cb, opts) => {
    const s = { grammar: JSON.parse(grammar), cb, opts, cancelled: false }
    sessions.push(s); calls.push('listen')
    return Promise.resolve({ stop() {}, cancel() { s.cancelled = true } })
  }
  const l = createGame2Listener({
    words, onHeard: e => heard.push(e), onStatus: s => statuses.push(s), getStream: () => 'stream-of-game', isHeld: () => false, now: () => 5,
    create: opts => createRealWithFakes(opts, listen), ...extra,
  })
  return { l, calls, sessions, heard, statuses }
}
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
const createRealWithFakes = (opts, listen) => createWordListener({ ...opts, runtime: { getModel: () => ({}) }, listen, micGain: () => 2, setTimer: () => 0, clearTimer: () => {} })

describe('слушатель стенда: что получает Vosk', () => {
  it('цели — слова фразы; словарь в нижнем регистре, обе записи «i am» / «i\'m», микрофон — поток игры, усиление из настроек', async () => {
    const r = rig()
    r.l.start()
    await Promise.resolve(); await Promise.resolve()
    const s = r.sessions[0]
    expect(s).toBeTruthy()
    expect(s.opts.stream).toBe('stream-of-game')
    expect(s.opts.gain).toBe(2)
    const phrases = s.grammar
    expect(phrases.every(p => p === p.toLowerCase())).toBe(true)
    for (const w of ['i am', "i'm", 'trying', 'to', 'learn', '[unk]']) expect(phrases).toContain(w)
    expect(phrases.some(p => p.includes('i am trying to learn') || p.includes("i'm trying to learn"))).toBe(true) // вся фраза — одним высказыванием («Тень», «По памяти»)
  })
  it('слушатель стартует один раз за проход; готов (ready) только когда распознаватель открыл микрофон', async () => {
    const r = rig()
    let ready = false
    r.l.ready().then(() => { ready = true })
    r.l.start()
    await Promise.resolve(); await Promise.resolve()
    expect(r.calls).toEqual(['listen']); expect(ready).toBe(false)
    r.sessions[0].cb.onReady()
    await Promise.resolve(); await Promise.resolve()
    expect(ready).toBe(true); expect(r.statuses).toContain('listening')
  })
  it('нет модели Vosk — слушатель сразу «готов» (лента не стоит), статус unavailable доходит до экрана', async () => {
    const statuses = []
    const l = createGame2Listener({ words, onHeard: () => {}, onStatus: s => statuses.push(s), create: opts => createWordListener({ ...opts, runtime: { getModel: () => null }, listen: () => {}, setTimer: () => 0, clearTimer: () => {} }) })
    l.start()
    expect(await l.ready()).toBe('unavailable'); expect(statuses).toContain('unavailable')
  })
  it('слова отдаются по числу засчитанных целей: переслушанный черновик не теряет слово, вставшее перед уже отданным', async () => {
    const r = rig()
    r.l.start()
    await Promise.resolve(); await Promise.resolve()
    const cb = r.sessions[0].cb
    cb.onReady()
    cb.onPartial('trying')
    cb.onPartial("i'm trying") // Vosk переслушал: перед «trying» встал «i'm»
    cb.onPartial("i'm trying to learn")
    expect(r.heard.map(h => h.text)).toEqual(['trying', "I'm", 'to', 'learn'])
    expect(r.heard.map(h => h.index).sort()).toEqual([0, 1, 2, 3])
    cb.onPartial("i'm trying to learn") // тот же текст — ничего нового
    expect(r.heard).toHaveLength(4)
  })
  it('restart: прежний сеанс закрыт, счёт обнулён, слова снова отдаются', async () => {
    const r = rig()
    r.l.start()
    await Promise.resolve(); await Promise.resolve()
    r.sessions[0].cb.onPartial('trying')
    r.l.restart()
    await Promise.resolve(); await Promise.resolve()
    expect(r.sessions).toHaveLength(2)
    r.sessions[1].cb.onPartial('trying')
    expect(r.heard.map(h => h.text)).toEqual(['trying', 'trying'])
  })
  it('тап вместо речи отдаёт слово с пометкой tap', async () => {
    const r = rig()
    r.l.start()
    r.l.tap(1)
    expect(r.heard).toEqual([{ text: 'trying', index: 1, at: 5, tap: true }])
  })
})

describe('размер словаря', () => {
  it('короткая фраза — до 4 слов подряд, длинная — меньше; всегда в потолке фраз и не меньше 2', () => {
    expect(grammarMax(words)).toBe(GRAMMAR_MAX)
    expect(phrasesCount(5, 4)).toBeLessThanOrEqual(GRAMMAR_PHRASES)
    const long = ['I', 'want', 'to', 'go', 'to', 'the', 'park', 'with', 'my', 'friend']
    const m = grammarMax(long)
    expect(m).toBeLessThan(GRAMMAR_MAX); expect(m).toBeGreaterThanOrEqual(2)
    expect(grammarMax(['hello'])).toBe(1)
  })
})

describe('дорожка микрофона после реплики Пита', () => {
  it('режим enabled-false: на реплике дорожка выключена, после неё enabled=true снова (иначе микрофон глухой)', () => {
    const track = { enabled: true, muted: false, readyState: 'live' }
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] }
    const timers = []
    const hold = createMicHold({ getStream: () => stream, session: { phase() {} }, store: { getItem: () => 'enabled-false' }, note() {}, setTimer: (f, ms) => (timers.push([f, ms]), timers.length), clearTimer() {} })
    const cancel = hold.holdFor(1500)
    expect(track.enabled).toBe(false); expect(hold.active()).toBe(true)
    timers[0][0]() // реплика закончилась
    expect(track.enabled).toBe(true); expect(hold.active()).toBe(false)
    cancel()
    expect(track.enabled).toBe(true)
  })
})

describe('проход ленты и слушатель', () => {
  const timeline = () => buildTimeline({ words, due: dueFlags(words, plan), ...timingsOf(words, null) })
  it('часы ленты не идут, пока слушатель не готов (микрофон открыт), и пошли после ready', async () => {
    let t = 1000
    const queue = []
    const ts = []
    let readyNow
    const listener = { start() {}, dispose() {}, ready: () => new Promise(r => { readyNow = r }) }
    const p = runLane({ mode: MODES.shadow, timeline: timeline(), lane: { setT: v => ts.push(v), mark() {} }, makeListener: () => listener, now: () => t, raf: f => queue.push(f), state: () => {}, cancelled: () => false })
    for (let k = 0; k < 5; k++) { for (const f of queue.splice(0)) f(); t += 20 }
    expect(ts).toHaveLength(0)
    readyNow('listening')
    await Promise.resolve(); await Promise.resolve()
    for (let k = 0; k < 3; k++) { for (const f of queue.splice(0)) f(); t += 20 }
    expect(ts.length).toBeGreaterThan(0); expect(ts[0]).toBe(0)
    void p
  })
})

describe('журнал микрофона', () => {
  it('словарь, черновики, итоги и уровень (пик и средний за секунду) попадают в журнал; ровный ноль помечен', () => {
    let t = 0
    const out = []
    const dbg = createMicDebug({ modeId: 'shadow', words, write: m => out.push(m), now: () => t })
    dbg('grammar', { targets: words, grammar: JSON.stringify(['a', 'b']) })
    dbg('partial', { raw: 'i am trying', seq: [0, 1], misses: 0 })
    dbg('final', { raw: 'i am trying', seq: [0, 1], misses: 0 })
    dbg('level', 0); t = 600; dbg('level', 0); t = 1200; dbg('level', 0)
    dbg('status', { status: 'listening' })
    expect(out[0]).toContain('2 фраз'); expect(out[1]).toContain('черновик «i am trying»'); expect(out[2]).toContain('ИТОГ')
    expect(out.some(m => m.includes('РОВНЫЙ НОЛЬ'))).toBe(true)
    expect(out.at(-1)).toContain('статус listening')
  })
})
