import { describe, it, expect, vi } from 'vitest'
import { createMiaSpeech, GAP_MS } from './miaSpeech.js'
import { voiceOf, MIA_VOICE } from './miaVoice.js'
import { isMiaLine, isChatter } from './miaLines.js'

// Очередь речи эпизода «Мия»: фейковые часы и таймеры, кот, слушатель и слоты звука
function rig({ voiced = {}, catBusy = 0, sayOk = true } = {}) {
  let t = 0, id = 0
  const timers = new Map()
  const setTimer = (fn, ms) => { const k = ++id; timers.set(k, { fn, at: t + ms }); return k }
  const clearTimer = k => timers.delete(k)
  const advance = ms => { const end = t + ms; for (;;) { const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; t = next[1].at; timers.delete(next[0]); next[1].fn() } t = end }
  const caps = [], played = [], said = [], holds = [], mutes = []
  const cat = { busyLeft: () => Math.max(0, catBusy - t), holdBusy: ms => holds.push(ms), sayLine: vi.fn((i, v, o) => { if (!sayOk) return false; said.push(i); setTimer(() => o.onEnd(), 1000); return true }) }
  const lines = { mia_push: { text: 'Иди сюда, пушистик, дальше командую я', url: voiced.mia_push ? 'u1' : null, duration: 2 }, mia_announce_1: { text: 'Посиди в коробке, понял?', url: null }, mia_ok_1: { text: 'Допустим', url: null }, pit_reply: { text: 'Ладно', url: null }, pit_back_1: { text: 'Спасибо', url: 'p' } }
  const sp = createMiaSpeech({
    now: () => t, setTimer, clearTimer, play: (key, onResult, onStart, onEnd) => { played.push(key); onStart(); onResult({ play: 'ok' }); setTimer(onEnd, 2000); return true }, has: key => voiced[key.replace('line:', '')] !== undefined || key === 'line:mia_push' && !!voiced.mia_push,
    bufferMs: () => 0, hold: null, onCaption: c => caps.push(c), log: () => {},
  })
  sp.use({ lines, cat, listener: { current: { mute: ms => mutes.push(ms) } } })
  return { sp, advance, caps, played, said, holds, mutes, cat, now: () => t }
}
const cue = (id, who, delay = 0) => ({ id, who, delay })

describe('голос Мии', () => {
  it('реплики mia_* — второй аккаунт и голос Elli; остальные — голос по умолчанию', () => {
    expect(isMiaLine('mia_push')).toBe(true); expect(isMiaLine('pit_reply')).toBe(false); expect(isMiaLine('race_start')).toBe(false)
    expect(voiceOf('mia_leave')).toEqual(MIA_VOICE); expect(MIA_VOICE).toMatchObject({ account: 'mia' }); expect(MIA_VOICE.voiceId).toBeUndefined(); expect(voiceOf('pit_back_1')).toBeNull(); expect(voiceOf('rh_x')).toBeNull()
  })
})

describe('очередь речи Мии', () => {
  it('неозвученная реплика Мии — подпись и «занят» у Пита; озвученная — звук из слота без подписи', () => {
    const r = rig({ voiced: { mia_push: true } })
    r.sp.enqueue([cue('mia_push', 'mia')])
    expect(r.played).toEqual(['line:mia_push']); expect(r.caps.filter(Boolean)).toEqual([]); expect(r.holds.length).toBe(1); expect(r.mutes.length).toBe(1)
    const r2 = rig()
    r2.sp.enqueue([cue('mia_announce_1', 'mia')])
    expect(r2.caps[0]).toMatchObject({ who: 'mia', text: 'Посиди в коробке, понял?' }); expect(r2.played).toEqual([])
  })
  it('реплики идут по очереди: следующая не раньше срока, паузы GAP_MS и конца предыдущей', () => {
    const r = rig()
    r.sp.enqueue([cue('mia_announce_1', 'mia', 0), cue('pit_reply', 'pit', 500)])
    expect(r.said).toEqual([])                                  // Пит ждёт: Мия ещё говорит
    r.advance(1700); expect(r.said).toEqual([])                  // подпись 1600 мс + пауза
    r.advance(GAP_MS + 200); expect(r.said).toEqual(['pit_reply'])
  })
  it('Пит занят — реплика ждёт; свободен — идёт', () => {
    const r = rig({ catBusy: 1500 })
    r.sp.enqueue([cue('mia_announce_1', 'mia')])
    expect(r.caps.filter(Boolean)).toEqual([]); r.advance(1400); expect(r.caps.filter(Boolean)).toEqual([]); r.advance(300); expect(r.caps.filter(Boolean)).toHaveLength(1)
  })
  it('мелкие колкости не встают в очередь, пока Мия говорит; при тишине — говорят', () => {
    const r = rig()
    r.sp.enqueue([cue('mia_announce_1', 'mia')]); r.sp.enqueue([cue('mia_ok_1', 'mia')])
    expect(r.sp.pending()).toBe(1)
    expect(isChatter('mia_ok_2')).toBe(true); expect(isChatter('mia_leave')).toBe(false)
    r.advance(5000); r.sp.enqueue([cue('mia_ok_1', 'mia')]); expect(r.caps.filter(Boolean).at(-1).text).toBe('Допустим')
  })
  it('реплика Пита: через его sayLine; занят (sayLine вернул false) — повтор позже; озвученная — без подписи', () => {
    const r = rig({ sayOk: false })
    r.sp.enqueue([cue('pit_reply', 'pit')]); expect(r.cat.sayLine).toHaveBeenCalledTimes(1); r.advance(400); expect(r.cat.sayLine.mock.calls.length).toBeGreaterThan(1)
    const ok = rig(); ok.sp.enqueue([cue('pit_back_1', 'pit')]); expect(ok.said).toEqual(['pit_back_1']); expect(ok.caps.filter(Boolean)).toEqual([])
    const silent = rig(); silent.sp.enqueue([cue('pit_reply', 'pit')]); expect(silent.caps.filter(Boolean)[0].who).toBe('pit')
  })
  it('stop: очередь, подпись и таймеры сброшены', () => {
    const r = rig()
    r.sp.enqueue([cue('mia_announce_1', 'mia'), cue('pit_reply', 'pit', 3000)]); r.sp.stop()
    expect(r.sp.pending()).toBe(0); expect(r.caps.at(-1)).toBeNull(); r.advance(10000); expect(r.said).toEqual([])
  })
})

describe('реплика Пита в очереди Мии (v3.3.233)', () => {
  it('Пита не держим «занятым» заранее: его sayLine сам ставит занятость (раньше холд до sayLine делал отказ и очередь вставала)', () => {
    const r = rig()
    r.sp.enqueue([cue('pit_reply', 'pit')])
    expect(r.said).toEqual(['pit_reply']); expect(r.holds).toEqual([])
    r.advance(1100); r.sp.enqueue([cue('mia_announce_1', 'mia')]); r.advance(1000)
    expect(r.holds.length).toBe(1) // реплика Мии держит Пита занятым
  })
  it('Пит не смог сказать (занят) — повтор раз в 300 мс, после лимита реплика пропущена и очередь идёт дальше', () => {
    const r = rig({ sayOk: false })
    r.sp.enqueue([cue('pit_reply', 'pit'), cue('mia_announce_1', 'mia')])
    r.advance(10000)
    expect(r.cat.sayLine.mock.calls.length).toBeGreaterThan(5); expect(r.cat.sayLine.mock.calls.length).toBeLessThanOrEqual(13)
    expect(r.caps.some(c => c?.text === 'Посиди в коробке, понял?')).toBe(true) // следующая реплика Мии дошла
  })
  it('onSpeak: рот Мии получает реплику (текст, длительность); stop() — сброс null', () => {
    const calls = []
    let t = 0
    const sp = createMiaSpeech({ now: () => t, setTimer: () => 1, clearTimer: () => {}, onSpeak: c => calls.push(c) })
    sp.use({ lines: { mia_announce_1: { text: 'Посиди в коробке, понял?', url: null } }, cat: { busyLeft: () => 0, holdBusy() {}, sayLine: () => true }, listener: null })
    sp.enqueue([cue('mia_announce_1', 'mia')])
    expect(calls[0]).toMatchObject({ id: 'mia_announce_1', text: 'Посиди в коробке, понял?', ms: expect.any(Number) }); expect(calls[0].ms).toBeGreaterThan(400)
    sp.stop(); expect(calls.at(-1)).toBeNull()
  })
})
