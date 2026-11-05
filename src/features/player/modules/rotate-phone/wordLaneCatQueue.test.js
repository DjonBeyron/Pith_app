import { describe, it, expect } from 'vitest'
import { createCatQueue, QUEUE_TAIL_MS } from './wordLaneCatQueue.js'
import { catPeek } from './wordLaneCatPeek.js'
import { createCatVoice } from './wordLaneCatVoice.js'

// Очередь речи Пита (v3.3.113): реплика, перевод, слово идут подряд — голова поднимается ОДИН раз, прячется ОДИН раз после последнего элемента; повторный hold только продлевает.
function stand() {
  let t = 0
  const timers = []
  const shows = [], hides = [], logs = []
  const peek = catPeek({ now: () => t, show: x => shows.push({ t, x }), hide: () => hides.push(t) })
  const setTimer = (fn, ms) => { const x = { fn, at: t + ms, done: false }; timers.push(x); return x }
  const clearTimer = x => { if (x) x.done = true }
  const queue = createCatQueue({ peek, now: () => t, setTimer, clearTimer, log: m => logs.push(m) })
  // шаг 16 мс; как микрофон в игре — каждый кадр peek.voice(0): он решает, пора ли прятаться
  const run = until => { while (t < until) { t += 16; timers.filter(x => x.at <= t && !x.done).forEach(x => { x.done = true; x.fn() }); peek.voice(0) } }
  return { peek, queue, shows, hides, logs, run, at: () => t }
}

describe('очередь речи Пита: одна голова на всю очередь', () => {
  it('два вызова подряд (реплика, потом перевод после паузы 600 мс): один подъём головы и одно опускание', () => {
    const s = stand()
    s.queue.add('реплика', 1200, { id: 'race_good_1' })
    s.run(1200 + 600) // реплика кончилась + LINE_PAUSE_MS — старая схема (хвост 400 мс) здесь уже опустила бы голову
    s.queue.add('перевод', 700, { id: 'слово' })
    s.run(1200 + 600 + 700 + QUEUE_TAIL_MS + 200)
    expect(s.shows).toHaveLength(1)
    expect(s.hides).toHaveLength(1)
    expect(s.queue.stats().lifts).toBe(1)
    expect(s.hides[0]).toBeGreaterThanOrEqual(1200 + 600 + 700) // прячется после ПОСЛЕДНЕГО элемента
  })
  it('старая схема (peek.hold(ms + 400) на каждом элементе) показывает дёрганье: два подъёма и два опускания', () => {
    let t = 0
    const shows = [], hides = []
    const peek = catPeek({ now: () => t, show: () => shows.push(t), hide: () => hides.push(t) })
    const run = until => { while (t < until) { t += 16; peek.voice(0) } }
    peek.hold(1200 + 400); run(1800)
    peek.hold(700 + 400); run(4000)
    expect(shows.length).toBe(2)
    expect(hides.length).toBe(2)
  })
  it('повторный hold/touch при поднятой голове только продлевает срок: show не вызывается заново', () => {
    const s = stand()
    s.queue.add('реплика', 1000)
    s.queue.touch(1500); s.queue.touch(300)
    s.run(300)
    s.queue.add('слово', 500)
    expect(s.shows).toHaveLength(1)
    s.run(300 + 2000)
    expect(s.hides).toHaveLength(1)
  })
  it('после паузы длиннее хвоста новая очередь поднимает голову снова — это уже другая речь', () => {
    const s = stand()
    s.queue.add('реплика', 800)
    s.run(800 + QUEUE_TAIL_MS + 700)
    expect(s.hides).toHaveLength(1)
    s.queue.add('перевод', 600)
    expect(s.shows).toHaveLength(2)
  })
  it('журнал «[cat] очередь: …»: подъём, «уже наверху (не перезапускаю)», пустая очередь; наложение помечено', () => {
    const s = stand()
    s.queue.add('реплика', 1000, { id: 'race_good_2' })
    s.queue.add('перевод', 500, { id: 'cat' })
    s.run(1100)
    expect(s.logs.every(l => l.startsWith('[cat] очередь:'))).toBe(true)
    expect(s.logs[0]).toContain('голова поднимается')
    expect(s.logs[1]).toContain('уже наверху')
    expect(s.logs[1]).toContain('НАЛОЖЕНИЕ')
    expect(s.logs.some(l => l.includes('пуста'))).toBe(true)
  })
  it('reset: очередь пуста, таймеры сняты', () => {
    const s = stand()
    s.queue.add('реплика', 1000)
    s.queue.reset()
    expect(s.queue.size()).toBe(0)
    expect(s.queue.busyLeft()).toBe(0)
  })
})

describe('голос кота ставит элементы в очередь', () => {
  it('speak() реплики и speak() перевода подряд → голова один раз поднялась и один раз опустилась; в журнале очередь', () => {
    let t = 0
    const timers = [], frames = []
    const shows = [], hides = [], logs = []
    const peek = catPeek({ now: () => t, show: () => shows.push(t), hide: () => hides.push(t) })
    const setTimer = (fn, ms) => { const x = { fn, at: t + ms, done: false }; timers.push(x); return x }
    const clearTimer = x => { if (x) x.done = true }
    const queue = createCatQueue({ peek, now: () => t, setTimer, clearTimer, log: m => logs.push(m) })
    const hold = { set() {} }, look = { lineStart() {}, lineEnd() {}, talking() {} }
    const voice = createCatVoice({ hold, look, peek, queue, now: () => t, raf: f => frames.push(f), caf: () => { frames.length = 0 }, setTimer, clearTimer, log: () => {} })
    const run = until => { while (t < until) { t += 16; frames.splice(0).forEach(f => f()); timers.filter(x => x.at <= t && !x.done).forEach(x => { x.done = true; x.fn() }); voice.mouth(0) } }
    voice.speak(null, 1200, { id: 'race_good_1', kind: 'реплика' })
    run(1200 + 650)
    voice.speak(null, 700, { id: 'cat', kind: 'перевод' })
    run(1200 + 650 + 700 + 2000)
    expect(shows).toHaveLength(1)
    expect(hides).toHaveLength(1)
    expect(logs.filter(l => l.includes('+реплика'))).toHaveLength(1)
    expect(logs.filter(l => l.includes('+перевод'))).toHaveLength(1)
  })
})
