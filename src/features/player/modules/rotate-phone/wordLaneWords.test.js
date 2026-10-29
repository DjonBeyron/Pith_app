import { describe, it, expect, vi } from 'vitest'
import { createWordListener, FLUSH_MS } from './wordLaneListen.js'

// Слова слушателя с таймингами для зеркала репетиции: words() — все заходы на ОДНОЙ шкале (мс от start()), startedAt() — чтобы привести её к записи дубля, flush() — итог последнего захода по концу дубля.
const w = (word, start, end) => ({ word, conf: 1, start, end })
const mkRuntime = () => ({ getModel: () => ({}) })
const tick = () => new Promise(r => setTimeout(r, 0))

/** Слушатель с управляемым временем и таймерами: заходы стартуют, когда тест зовёт timers.fire() (после now.t = …) */
function rig(script, opts = {}) {
  const now = { t: 10000 }
  const timers = []
  const calls = []
  const handles = []
  const cleared = new Set()
  const listen = async (model, grammar, cb, o) => {
    calls.push(o)
    const step = script.shift() ?? { hang: true }
    const h = { stop: vi.fn(() => step.onStop?.(cb)), cancel: vi.fn() }
    handles.push(h)
    queueMicrotask(() => { cb.onReady?.(); if (!step.hang) cb.onResult(step.text ?? '', { words: step.words ?? [], readyMs: step.readyMs, micMs: step.micMs, audioStartMs: step.audioStartMs }) })
    return h
  }
  const setTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  const l = createWordListener({ targets: ['i am', 'trying', 'to learn'], expected: 3, runtime: mkRuntime(), listen, now: () => now.t, setTimer, clearTimer: id => cleared.add(id), onChange: opts.onChange, ...opts.extra })
  return { l, now, timers, calls, handles, cleared }
}

describe('слушатель: words() на общей шкале заходов', () => {
  it('до слов нет — пусто; startedAt() — момент start()', () => {
    const { l } = rig([])
    expect(l.words()).toEqual([]); expect(l.startedAt()).toBe(0)
    l.start()
    expect(l.startedAt()).toBe(10000)
    l.dispose()
  })

  it('два захода: слова второго сдвинуты на старт захода (время идёт дальше, а не с нуля)', async () => {
    const { l, now, timers } = rig([
      { text: "i'm trying", words: [w("i'm", 0.4, 0.7), w('trying', 0.78, 1.3)], readyMs: 100 },
      { text: 'to learn', words: [w('to', 0.2, 0.32), w('learn', 0.32, 0.8)], readyMs: 80 },
    ])
    l.start()
    for (let i = 0; i < 3; i++) await tick()
    expect(l.words().map(x => [x.word, x.start, x.end])).toEqual([["i'm", 500, 800], ['trying', 880, 1400]]) // заход 1: старт 0 + readyMs 100 + секунды Vosk
    now.t = 13000 // заход 2 начинается через 3 с после start()
    timers.at(-1).fn()
    for (let i = 0; i < 3; i++) await tick()
    expect(l.words().map(x => [x.word, x.start, x.end])).toEqual([["i'm", 500, 800], ['trying', 880, 1400], ['to', 3280, 3400], ['learn', 3400, 3880]])
    expect(l.words()[0]).toMatchObject({ conf: 1 })
    l.dispose()
  })

  it('нет readyMs — micMs + audioStartMs; words() отдаёт копию; слова без времени отбрасываются', async () => {
    const { l } = rig([{ text: 'trying', words: [w('trying', 0.1, 0.5), { word: 'x' }, { word: 'y', start: 'a', end: 1 }], micMs: 30, audioStartMs: 20 }])
    l.start()
    for (let i = 0; i < 3; i++) await tick()
    const got = l.words()
    expect(got.map(x => [x.word, x.start, x.end])).toEqual([['trying', 150, 550]])
    got.length = 0
    expect(l.words()).toHaveLength(1)
    l.dispose()
  })

  it('слова не идут в onChange (перерисовок не плодят)', async () => {
    const seen = []
    const { l } = rig([{ text: 'trying', words: [w('trying', 0.1, 0.5)] }], { onChange: s => seen.push(Object.keys(s)) })
    l.start()
    for (let i = 0; i < 3; i++) await tick()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.flat()).not.toContain('words')
    l.dispose()
  })

  it('тап вместо речи: цель записывается словом «сейчас» (проверка механики без Vosk)', () => {
    const { l, now } = rig([])
    l.start()
    now.t = 11500
    l.tap(1)
    expect(l.words()).toEqual([expect.objectContaining({ word: 'trying', start: 1500, end: 1750, tap: true })])
    l.dispose()
  })
})

describe('слушатель: параметры дубля', () => {
  it('gate: false уходит в движок, по умолчанию затвор тишины включён; следующий заход — через restartMs', async () => {
    const a = rig([{ text: 'trying', words: [] }], { extra: { gate: false, restartMs: 0 } })
    a.l.start()
    for (let i = 0; i < 3; i++) await tick()
    expect(a.calls[0].gate).toBe(false)
    expect(a.timers.at(-1).ms).toBe(0)
    a.l.dispose()
    const b = rig([{ text: 'trying', words: [] }])
    b.l.start()
    for (let i = 0; i < 3; i++) await tick()
    expect(b.calls[0].gate).toBe(true)
    expect(b.timers.at(-1).ms).toBe(150)
    b.l.dispose()
  })
})

describe('слушатель: flush() по концу дубля', () => {
  it('просит у Vosk итог захода (stop), ждёт его, слова последней фразы попадают в words(), новых заходов нет', async () => {
    const { l, timers, calls, handles } = rig([{ hang: true, onStop: cb => queueMicrotask(() => cb.onResult('to learn', { words: [w('to', 1.0, 1.1), w('learn', 1.1, 1.6)], readyMs: 50 })) }])
    l.start()
    await tick()
    let done = false
    const p = l.flush().then(() => { done = true })
    expect(handles[0].stop).toHaveBeenCalledTimes(1)
    await p
    expect(done).toBe(true)
    expect(l.words().map(x => [x.word, x.start, x.end])).toEqual([['to', 1050, 1150], ['learn', 1150, 1650]])
    expect(timers.filter(t => t.ms === 150 || t.ms === 0)).toHaveLength(0) // «следующий заход» не назначен
    expect(calls).toHaveLength(1)
    l.dispose()
  })

  it('итог не пришёл — ждёт не дольше FLUSH_MS (таймер), слова что есть остаются', async () => {
    const { l, timers } = rig([{ hang: true }])
    l.start()
    await tick()
    let done = false
    const p = l.flush().then(() => { done = true })
    await tick()
    expect(done).toBe(false)
    const t = timers.find(x => x.ms === FLUSH_MS)
    expect(t).toBeTruthy()
    t.fn()
    await p
    expect(done).toBe(true)
    l.dispose()
  })

  it('нет живого захода (модели нет / между заходами) или слушатель закрыт — готов сразу; повторный заход после flush не стартует', async () => {
    const none = createWordListener({ targets: ['go'], runtime: { getModel: () => null }, onChange() {} })
    none.start()
    await expect(none.flush()).resolves.toBeUndefined()
    const { l, timers, calls, cleared } = rig([{ text: 'trying', words: [] }])
    l.start()
    for (let i = 0; i < 3; i++) await tick()
    const restart = timers.findIndex(t => t.ms === 150) + 1
    expect(restart).toBeGreaterThan(0) // заход закончился, следующий назначен
    expect(cleared.has(restart)).toBe(false)
    await l.flush() // слушатель ждёт следующего захода — flush его отменяет
    expect(cleared.has(restart)).toBe(true)
    l.dispose()
    await expect(l.flush()).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
  })
})
