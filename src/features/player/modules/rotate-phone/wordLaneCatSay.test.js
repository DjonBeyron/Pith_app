import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { startCatLine, CAT_RISE_MS } from './wordLaneCatSay.js'
import { normalizeLines, lineKey, LINE_PAUSE_MS } from './wordLaneCatLines.js'
import { createDebugSession } from './useWordLaneDebug.js'
import { catDebug } from './wordLaneCatDebug.js'

// Как стартует реплика кота: звук, рот, микрофон, голова, журнал
const lines = normalizeLines({ lines: { your_turn: { text: 'Теперь твоя очередь', url: 'https://x/a.mp3', duration: 2, words: [{ w: 'Теперь', t: 0.2, e: 0.7 }, { w: 'твоя', t: 0.8, e: 1.2 }, { w: 'очередь', t: 1.3, e: 1.9 }] }, try_again: { text: 'Ничего, попробуем ещё раз' } } })

function mk({ up = true, slot = true, play = true } = {}) {
  const api = { isUp: () => up, peek: vi.fn(), speak: vi.fn() }
  const mute = vi.fn()
  const timers = []
  const log = vi.fn()
  const deps = { catApi: { current: api }, listenerRef: { current: { mute } }, has: vi.fn(() => slot), play: vi.fn(() => play), setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, log }
  return { api, mute, timers, log, deps }
}

describe('реплика кота: старт', () => {
  it('голова торчит: звук и рот сразу; дорожка строится по таймингам слов и длине озвучки; журналу передан id', () => {
    const m = mk()
    const r = startCatLine({ id: 'your_turn', line: lines.your_turn, ...m.deps })
    expect(r).toMatchObject({ ms: 2000, rise: 0, voiced: true, timer: 0 })
    expect(m.deps.play).toHaveBeenCalledWith(lineKey('your_turn'))
    const [track, ms, meta] = m.api.speak.mock.calls[0]
    expect(ms).toBe(2000)
    expect(meta).toEqual({ id: 'your_turn' })
    expect(track[0].at).toBeGreaterThanOrEqual(200 - 1)           // первое слово — на 0,2 с, а не в нуле
    expect(m.mute).toHaveBeenCalledWith(2000 + LINE_PAUSE_MS)
  })

  it('голова спрятана: сначала выскакивает (peek), звук и рот — через CAT_RISE_MS; микрофон молчит и на это время', () => {
    const m = mk({ up: false })
    const r = startCatLine({ id: 'your_turn', line: lines.your_turn, ...m.deps })
    expect(r.rise).toBe(CAT_RISE_MS)
    expect(m.api.peek).toHaveBeenCalledWith(CAT_RISE_MS + 2000 + 400)
    expect(m.deps.play).not.toHaveBeenCalled()
    expect(m.api.speak).not.toHaveBeenCalled()
    expect(m.timers).toHaveLength(1)
    expect(m.timers[0].ms).toBe(CAT_RISE_MS)
    expect(m.mute).toHaveBeenCalledWith(CAT_RISE_MS + 2000 + LINE_PAUSE_MS)
    m.timers[0].fn()
    expect(m.deps.play).toHaveBeenCalledTimes(1)
    expect(m.api.speak).toHaveBeenCalledTimes(1)
  })

  it('нет озвучки (no-url) или звук не подготовлен (no-slot): рот не двигается, кот просто выглядывает; причина в журнале', () => {
    const a = mk()
    expect(startCatLine({ id: 'try_again', line: lines.try_again, ...a.deps }).voiced).toBe(false)
    expect(a.log).toHaveBeenCalledWith('cat-line-silent', { id: 'try_again', reason: 'no-url' })
    expect(a.api.speak).not.toHaveBeenCalled()
    expect(a.api.peek).toHaveBeenCalled()
    expect(a.mute).not.toHaveBeenCalled()
    const b = mk({ slot: false })
    startCatLine({ id: 'your_turn', line: lines.your_turn, ...b.deps })
    expect(b.log).toHaveBeenCalledWith('cat-line-silent', { id: 'your_turn', reason: 'no-slot' })
  })

  it('слот есть, но play() отказал — тоже cat-line-silent, рот не двигается впустую', () => {
    const m = mk({ play: false })
    startCatLine({ id: 'your_turn', line: lines.your_turn, ...m.deps })
    expect(m.api.speak).not.toHaveBeenCalled()
    expect(m.log).toHaveBeenCalledWith('cat-line-silent', { id: 'your_turn', reason: 'no-slot' })
  })

  it('скорость голоса укорачивает реплику, и рот идёт за ней', () => {
    const m = mk()
    expect(startCatLine({ id: 'your_turn', line: lines.your_turn, rate: 2, ...m.deps }).ms).toBe(1000)
    expect(m.api.speak.mock.calls[0][1]).toBe(1000)
  })

  it('кота ещё нет (catApi.current == null) — не падает', () => {
    const r = startCatLine({ id: 'your_turn', line: lines.your_turn, catApi: { current: null }, has: () => true, play: () => true, log: vi.fn() })
    expect(r.voiced).toBe(true)
  })
})

describe('журнал отладки: события кота попадают в файл', () => {
  it('сессия отладки ставит приёмник на arm() и снимает на disarm(); события — type event, kind cat-speak', () => {
    const probe = { install: vi.fn(), snapshot: () => [], subscribe: () => () => {}, queryPermission: async () => {} }
    const s = createDebugSession({ enabled: true, now: () => 1000000, probe, extras: () => ({}), recorderDeps: { MR: undefined, md: null } })
    s.arm()
    catDebug('cat-speak', { id: 'your_turn', ms: 2000, trackLen: 12 })       // так кот пишет начало реплики (wordLaneCatVoice)
    catDebug('cat-speak-end', { id: 'your_turn', played: 2010, shapes: 14, micBlocked: 30, why: 'done' })
    s.disarm()
    catDebug('cat-speak', { id: 'после disarm' })                               // приёмник снят — в файл не попадает
    const ev = s.dump().events.filter(e => e.type === 'event')
    expect(ev.map(e => e.kind)).toEqual(['cat-speak', 'cat-speak-end'])
    expect(ev[0]).toMatchObject({ id: 'your_turn', ms: 2000, trackLen: 12 })
    expect(ev[1]).toMatchObject({ shapes: 14, micBlocked: 30, why: 'done' })
  })

  it('arm() подключает setCatDebug, disarm() отключает (проверка по исходнику)', () => {
    const src = readFileSync(new URL('./useWordLaneDebug.js', import.meta.url), 'utf8')
    expect(src).toContain("setCatDebug((kind, d) => base.event(kind, d))")
    expect(src).toContain('setCatDebug(null)')
  })
})
