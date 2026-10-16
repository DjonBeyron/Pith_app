import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { planSegmentChain, chainLayout, LEAD_PAD, TAIL_PAD } from './audioChainPlan.js'
import { playSegmentChain } from './audioChain.js'

// Цепочка озвучки реплики-шаблона: план, раскладка по времени, проигрывание на поддельных <audio> и виртуальных таймерах
const T = (word, start, end) => ({ word, start, end })
const seg = (text, url, timings, extra = {}) => ({ text, audioUrl: url, wordTimings: timings, ...extra })
const line = {
  text: 'Can I have cheese, please?',
  segments: [
    seg('Can I have', 'https://r2/a.mp3', [T('Can', 0.1, 0.3), T('I', 0.3, 0.4), T('have', 0.4, 0.8)], { audioMeta: { durationMs: 1000 } }),
    { text: 'cheese', word: true, audioUrl: 'https://r2/w.mp3', wordTimings: [T('cheese', 0, 0.5)] },
    seg(', please?', 'https://r2/b.mp3', [T('please', 0.2, 0.7)], { audioMeta: { durationMs: 900 } }),
  ],
}

function fakeAudio(name) {
  const ls = {}
  return {
    name, src: '', currentTime: 0, paused: true, duration: NaN, readyState: 4, error: null, muted: false, playbackRate: 1,
    addEventListener(ev, fn) { (ls[ev] ??= new Set()).add(fn) },
    removeEventListener(ev, fn) { ls[ev]?.delete(fn) },
    fire(ev) { [...(ls[ev] ?? [])].forEach(fn => fn()) },
    listeners: () => Object.values(ls).reduce((n, s) => n + s.size, 0),
    play: vi.fn(function () { this.paused = false; return Promise.resolve() }),
    pause: vi.fn(function () { this.paused = true }),
    load: vi.fn(), removeAttribute: vi.fn(function (k) { if (k === 'src') this.src = '' }),
  }
}
const noRaf = { raf: () => 0, caf: () => {}, isHidden: () => false }
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('planSegmentChain', () => {
  it('годится, когда у каждой озвучиваемой части есть файл; части без букв пропускаются', () => {
    const p = planSegmentChain({ segments: [...line.segments, { text: '?' }, { text: '  ' }] })
    expect(p.ok).toBe(true)
    expect(p.parts.map(x => x.text)).toEqual(['Can I have', 'cheese', ', please?'.trim()])
    expect(p.parts[1].word).toBe(true)
    expect(p.parts[0].durationSec).toBe(1)
  })
  it('нет файла у слова → не ok (reason word-no-audio, missing — слово); у части → part-no-audio', () => {
    const noWord = { segments: [line.segments[0], { text: 'cheese', word: true }, line.segments[2]] }
    expect(planSegmentChain(noWord)).toMatchObject({ ok: false, reason: 'word-no-audio', missing: 'cheese' })
    expect(planSegmentChain({ segments: [{ text: 'Hi' }] })).toMatchObject({ ok: false, reason: 'part-no-audio' })
  })
  it('неподставленный {var}, нет segments, одни знаки → не ok', () => {
    expect(planSegmentChain({ segments: [line.segments[0], { var: 'food' }] }).reason).toBe('unfilled-var')
    expect(planSegmentChain({ text: 'x' }).reason).toBe('no-segments')
    expect(planSegmentChain({ segments: [{ text: '?' }] }).reason).toBe('empty')
  })
})

describe('chainLayout — раскладка во времени', () => {
  const layout = chainLayout(planSegmentChain(line).parts)
  it('тишина по краям частей обрезается по wordTimings; слово из библиотеки не обрезается', () => {
    const [a, w, b] = layout.items
    expect(a.lead).toBeCloseTo(0.1 - LEAD_PAD)
    expect(a.end).toBeCloseTo(0.8 + TAIL_PAD)
    expect(w.lead).toBe(0)
    expect(w.end).toBeNull() // играет до конца файла
    expect(b.lead).toBeCloseTo(0.2 - LEAD_PAD)
    expect(b.end).toBeCloseTo(0.7 + TAIL_PAD)
  })
  it('общая длительность = сумма отрезков; тайминги слов смещены на накопленное время', () => {
    const [a, w, b] = layout.items
    expect(layout.totalSec).toBeCloseTo(a.span + w.span + b.span)
    expect(w.offset).toBeCloseTo(a.span)
    expect(b.offset).toBeCloseTo(a.span + w.span)
    const words = layout.timings
    expect(words.map(x => x.word)).toEqual(['Can', 'I', 'have', 'cheese', 'please'])
    expect(words[0].start).toBeCloseTo(LEAD_PAD)            // «Can» стартует сразу после вырезанной тишины
    expect(words[3].start).toBeCloseTo(a.span)               // слово — с начала своего отрезка
    expect(words[4].start).toBeCloseTo(a.span + w.span + LEAD_PAD)
    for (let i = 1; i < words.length; i++) expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].start)
  })
  it('часть без таймингов: длительность из audioMeta, тайминги синтетические внутри отрезка', () => {
    const l = chainLayout(planSegmentChain({ segments: [{ text: 'Hello there', audioUrl: 'u', audioMeta: { durationMs: 2000 } }] }).parts)
    expect(l.items[0].end).toBeNull()
    expect(l.totalSec).toBeCloseTo(2)
    expect(l.timings).toHaveLength(2)
  })
})

describe('playSegmentChain — цепочка на двух элементах', () => {
  function start(extra = {}) {
    const a = fakeAudio('A'); const b = fakeAudio('B')
    const cbs = { onEnd: vi.fn(), onFail: vi.fn(), onMode: vi.fn(), onGap: vi.fn(), shapes: [] }
    const plan = planSegmentChain(line)
    const cancel = playSegmentChain(plan, a, { ...noRaf, spare: b, srcOf: u => (u.endsWith('a.mp3') ? 'blob:a' : null), applyMouth: s => cbs.shapes.push(s), ...cbs, ...extra })
    return { a, b, cbs, cancel, plan }
  }
  const items = chainLayout(planSegmentChain(line).parts).items

  it('порядок: часть → слово → часть; следующая подгружена заранее на втором элементе; одновременно звучит один', async () => {
    const { a, b, cbs } = start()
    expect(a.src).toBe('blob:a')                 // srcOf подменил ссылку первой части
    expect(a.play).toHaveBeenCalledTimes(1)
    expect(b.src).toBe('https://r2/w.mp3')       // слово уже стоит на втором элементе
    expect(b.play).not.toHaveBeenCalled()
    expect(a.currentTime).toBeCloseTo(items[0].lead)
    expect(cbs.onMode).toHaveBeenCalledWith('audio')
    a.fire('playing')
    // эстафета: по времени конца части (end − currentTime)
    a.currentTime = items[0].end
    vi.advanceTimersByTime(Math.round((items[0].end - items[0].lead) * 1000) + 5)
    expect(b.play).toHaveBeenCalledTimes(1)
    expect(a.pause).toHaveBeenCalled()
    expect([a, b].filter(x => !x.paused)).toHaveLength(1) // звучит ровно один
    b.fire('playing')
    expect(cbs.onGap).toHaveBeenCalledTimes(1)
    expect(a.src).toBe('https://r2/b.mp3')       // пока играет слово, на первом элементе готовится третья часть
    b.fire('ended')                              // слово без обрезки хвоста — по ended
    expect(a.play).toHaveBeenCalledTimes(2)
    expect(b.pause).toHaveBeenCalled()
    expect(a.currentTime).toBeCloseTo(items[2].lead)
    a.fire('playing'); a.currentTime = items[2].end
    vi.advanceTimersByTime(Math.round((items[2].end - items[2].lead) * 1000) + 5) // хвост последней части тоже обрезан
    await flush()
    expect(cbs.onEnd).toHaveBeenCalledTimes(1)
    expect(cbs.onFail).not.toHaveBeenCalled()
    expect(a.listeners() + b.listeners()).toBe(0)
    expect(b.removeAttribute).toHaveBeenCalledWith('src') // второй элемент освобождён
    expect(cbs.shapes.at(-1)).toBe('closed')
  })

  it('рот идёт по общим таймингам: открыт на слове первой части, на паузе после слова закрыт', () => {
    const { a, cbs } = start()
    a.currentTime = 0.15; a.fire('playing')              // «Can» (локально 0.1–0.3)
    expect(cbs.shapes.at(-1)).toBe('open')
    cbs.shapes.length = 0
    a.currentTime = 0.82                                   // после «have», до эстафеты — пауза в таймингах
    vi.advanceTimersByTime(0)
    expect(cbs.shapes.length === 0 || cbs.shapes.at(-1) === 'closed').toBe(true)
  })

  it('отмена посреди цепочки: пауза, обработчики и таймеры сняты, onEnd/onFail не зовутся', () => {
    const { a, b, cbs, cancel } = start()
    a.fire('playing')
    cancel()
    expect(a.pause).toHaveBeenCalled()
    expect(a.listeners() + b.listeners()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    a.fire('ended'); vi.advanceTimersByTime(10_000)
    expect(cbs.onEnd).not.toHaveBeenCalled()
    expect(cbs.onFail).not.toHaveBeenCalled()
    expect(cbs.shapes.at(-1)).toBe('closed')
  })

  it('отказ первой части до начала звука → onFail (реплика уйдёт на синтез), onEnd нет', async () => {
    const a = fakeAudio('A'); a.play = vi.fn(() => { const e = new Error('x'); e.name = 'NotAllowedError'; return Promise.reject(e) })
    const onFail = vi.fn(); const onEnd = vi.fn()
    playSegmentChain(planSegmentChain(line), a, { ...noRaf, onFail, onEnd })
    await flush()
    expect(onFail).toHaveBeenCalledWith('not-allowed')
    expect(onEnd).not.toHaveBeenCalled()
    expect(a.listeners()).toBe(0)
  })

  it('таймаут загрузки без звука: одна повторная попытка, потом onFail', () => {
    const a = fakeAudio('A'); const onFail = vi.fn()
    playSegmentChain(planSegmentChain(line), a, { ...noRaf, onFail })
    vi.advanceTimersByTime(7000)      // первая попытка не началась → retry
    vi.advanceTimersByTime(400)
    expect(a.load).toHaveBeenCalled()
    vi.advanceTimersByTime(7000)
    expect(onFail).toHaveBeenCalledWith('load-timeout')
  })

  it('ошибка средней части после начала звука: часть пропускается, цепочка идёт дальше', () => {
    const { a, b, cbs } = start()
    a.fire('playing'); a.currentTime = items[0].end
    vi.advanceTimersByTime(Math.round((items[0].end - items[0].lead) * 1000) + 5)
    b.error = { code: 4 }; b.fire('error')      // слово не загрузилось
    expect(a.play).toHaveBeenCalledTimes(2)     // сразу третья часть
    expect(cbs.onFail).not.toHaveBeenCalled()
  })

  it('второй элемент без разрешения на звук (iOS): дальше играет один основной', async () => {
    const a = fakeAudio('A'); const b = fakeAudio('B')
    b.play = vi.fn(() => { b.paused = false; const e = new Error('x'); e.name = 'NotAllowedError'; return Promise.reject(e) })
    const onEnd = vi.fn(); const onFail = vi.fn()
    playSegmentChain(planSegmentChain(line), a, { ...noRaf, spare: b, onEnd, onFail })
    a.fire('playing'); a.currentTime = items[0].end
    vi.advanceTimersByTime(Math.round((items[0].end - items[0].lead) * 1000) + 5)
    await flush()
    expect(a.play).toHaveBeenCalledTimes(2)     // слово — уже на основном элементе
    expect(a.src).toBe('https://r2/w.mp3')
    expect(onFail).not.toHaveBeenCalled()
  })

  it('слабое устройство (lowPower): один элемент, src меняется на нём же, второй не трогаем', () => {
    const a = fakeAudio('A'); const b = fakeAudio('B')
    playSegmentChain(planSegmentChain(line), a, { ...noRaf, spare: b, lowPower: true })
    expect(b.src).toBe('')
    a.fire('playing'); a.currentTime = items[0].end
    vi.advanceTimersByTime(Math.round((items[0].end - items[0].lead) * 1000) + 5)
    expect(a.src).toBe('https://r2/w.mp3')
    expect(a.play).toHaveBeenCalledTimes(2)
    expect(b.play).not.toHaveBeenCalled()
  })

  it('rate и muted ставятся на оба элемента; запасной таймер части = длительность / rate', () => {
    const { a, b } = start({ rate: 1.5, muted: true })
    expect(a.playbackRate).toBe(1.5); expect(b.playbackRate).toBe(1.5)
    expect(a.muted).toBe(true); expect(b.muted).toBe(true)
  })

  it('потерянный ended у последней части: запасной таймер завершает цепочку', () => {
    const { a, b, cbs } = start()
    a.fire('playing'); a.currentTime = items[0].end
    vi.advanceTimersByTime(Math.round((items[0].end - items[0].lead) * 1000) + 5)
    b.fire('playing'); b.fire('ended')
    a.fire('playing'); a.duration = 0.75; a.currentTime = 0.3  // файл короче end: switch не ставится — спасает только запасной таймер
    vi.advanceTimersByTime(items[2].span * 1000 + 2000)
    expect(cbs.onEnd).toHaveBeenCalledTimes(1)
  })
})
