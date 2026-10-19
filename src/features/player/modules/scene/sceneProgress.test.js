import { describe, it, expect } from 'vitest'
import { lineDurationMs, planSceneDurations, MIN_LINE_MS } from './sceneProgressPlan.js'
import { createProgressTimeline, LAST_CAP, CREEP_CAP, END_MS, REWIND_MS } from './sceneProgressModel.js'
import { fallbackMs } from '../../../scene/v2/linePlayback.js'
import { demoCafeScene } from '../../../scene/v2/demoScenes.js'

// Прогресс по времени: план длительностей реплик и модель кольца/полосы (чистая, время — аргументом)
const scene = (timeline, extra = {}) => ({ ...demoCafeScene, timeline, options: { ...demoCafeScene.options, ...(extra.options ?? {}) } })
const L = (text, extra = {}) => ({ who: 'a', text, emotion: 'neutral', ...extra })

// Прогнать сцену виртуальными часами: реплики длятся real[i]; шаг 10 мс, снимаем значение кольца
function simulate(durations, real, { sample = 10, pauses = [] } = {}) {
  const tl = createProgressTimeline()
  const total = durations.length
  const track = []
  let now = 1000
  let run = 0
  let st = (status, index) => tl.onState({ status, index, run, total }, { durations, now })
  st('idle', 0)
  for (let i = 0; i < total; i += 1) {
    run += 1
    st('playing', i)
    let t = 0
    let remaining = real[i]
    for (const p of pauses.filter(p => p.line === i)) { // пауза посреди реплики: реплика потом играется с начала
      while (t < p.at) { now += sample; t += sample; track.push(tl.value(now)) }
      st('paused', i)
      for (let k = 0; k < p.len / sample; k += 1) { now += sample; track.push(tl.value(now)) }
      run += 1
      st('playing', i)
      t = 0
    }
    while (t < remaining) { now += sample; t += sample; track.push(tl.value(now)) }
  }
  st('ended', total - 1)
  for (let k = 0; k < END_MS / sample + 2; k += 1) { now += sample; track.push(tl.value(now)) }
  return track
}

describe('sceneProgressPlan — длительность реплик', () => {
  it('нет файла: как таймер/синтез — fallbackMs(текст, скорость); не меньше MIN_LINE_MS', () => {
    const s = scene([L('Hello there my friend')])
    const d = lineDurationMs(s, s.timeline[0], { rate: 1 })
    expect(d).toBe(fallbackMs('Hello there my friend', s.characters.a.voice?.rate ?? 1))
    expect(lineDurationMs(s, s.timeline[0], { rate: 2 })).toBeLessThan(d)
    expect(lineDurationMs(s, L(''), {})).toBeGreaterThanOrEqual(MIN_LINE_MS)
    expect(lineDurationMs(s, null)).toBe(MIN_LINE_MS)
  })

  it('файл озвучки: audioMeta.durationMs / rate; без меты — конец последнего слова', () => {
    const s = scene([L('Hi', { audioUrl: 'https://r2/a.mp3', audioMeta: { hash: 'h', voiceId: 'v', durationMs: 2400 } })])
    expect(lineDurationMs(s, s.timeline[0], { rate: 1 })).toBe(2400)
    expect(lineDurationMs(s, s.timeline[0], { rate: 2 })).toBe(1200)
    const t = L('Hi there', { audioUrl: 'https://r2/b.mp3', wordTimings: [{ word: 'Hi', start: 0, end: 0.5 }, { word: 'there', start: 0.6, end: 1.7 }] })
    expect(lineDurationMs(s, t, { rate: 1 })).toBe(1700)
  })

  it('перевод добавляется только при озвучке перевода; файл перевода — по его мете', () => {
    const line = L('Hi', {
      audioUrl: 'https://r2/a.mp3', audioMeta: { hash: 'h', voiceId: 'v', durationMs: 1000 },
      translation: 'Привет', translationAudioUrl: 'https://r2/t.mp3', translationAudioMeta: { hash: 'h2', voiceId: 'v', durationMs: 800 },
    })
    const s = scene([line])
    expect(lineDurationMs(s, line, {})).toBe(1000)
    expect(lineDurationMs(s, line, { voice: { translation: true } })).toBe(1800)
    expect(lineDurationMs(s, line, { voice: { translation: true }, once: true })).toBe(1000) // «Ещё раз» — только оригинал
    // перевод без файла и без звука — пропускается сразу
    const noFile = { ...line, translationAudioUrl: undefined, translationAudioMeta: undefined }
    expect(lineDurationMs(s, noFile, { voice: { translation: true }, sound: false })).toBe(1000)
    expect(lineDurationMs(s, noFile, { voice: { translation: true }, sound: true })).toBeGreaterThan(1000)
  })

  it('planSceneDurations: массив по репликам и сумма', () => {
    const p = planSceneDurations(demoCafeScene, {})
    expect(p.durations).toHaveLength(demoCafeScene.timeline.length)
    expect(p.totalMs).toBe(p.durations.reduce((a, b) => a + b, 0))
    expect(planSceneDurations(null)).toEqual({ durations: [], totalMs: 0 })
  })
})

describe('sceneProgressModel — кольцо/полоса: плавно, монотонно, без скачков', () => {
  const D = [2000, 3000, 1500]

  it('idle — пусто; старт реплики 0 — шаг к концу реплики за её длительность', () => {
    const tl = createProgressTimeline()
    expect(tl.onState({ status: 'idle', index: 0, run: 0 }, { durations: D, now: 0 })).toEqual({ from: 0, steps: [] })
    const r = tl.onState({ status: 'playing', index: 0, run: 1 }, { durations: D, now: 100 })
    expect(r.from).toBe(0)
    expect(r.steps).toHaveLength(2) // основной шаг к концу реплики + медленный хвост (кольцо не стоит, если звук длиннее оценки)
    expect(r.steps[0].ms).toBe(2000)
    expect(r.steps[1].to).toBeGreaterThan(r.steps[0].to)
    expect(r.steps[0].to).toBeCloseTo(2000 / 6500, 5)
    expect(tl.value(100)).toBe(0)
    expect(tl.value(1100)).toBeCloseTo(r.steps[0].to / 2, 5) // линейно
    expect(tl.value(100 + 2000)).toBeCloseTo(r.steps[0].to, 5)
  })

  it('идеальный проход (реплики длятся как в плане): монотонно, шаг ≤ ~1 % за 10 мс, к концу ≈ LAST_CAP, ended → 1', () => {
    const tr = simulate(D, D)
    for (let i = 1; i < tr.length; i += 1) {
      expect(tr[i]).toBeGreaterThanOrEqual(tr[i - 1] - 1e-9) // монотонно
      expect(tr[i] - tr[i - 1]).toBeLessThan(0.02) // нет скачков (10 мс = 0.15 % от 6.5 с; конец — доезд 260 мс)
    }
    expect(Math.max(...tr.slice(0, -30))).toBeLessThanOrEqual(LAST_CAP + 1e-9)
    expect(tr.at(-1)).toBe(1)
    // посередине сцены кольцо около середины (синхрон со временем ±2 %)
    expect(tr[Math.round(tr.length * 0.5)]).toBeGreaterThan(0.45)
    expect(tr[Math.round(tr.length * 0.5)]).toBeLessThan(0.55)
  })

  it('реплики короче плана (звук быстрее оценки): нет скачков на стыках, монотонно, ended догоняет без дыры', () => {
    const tr = simulate(D, [1200, 1800, 900])
    let maxJump = 0
    for (let i = 1; i < tr.length; i += 1) {
      expect(tr[i]).toBeGreaterThanOrEqual(tr[i - 1] - 1e-9)
      maxJump = Math.max(maxJump, tr[i] - tr[i - 1])
    }
    expect(maxJump).toBeLessThan(0.05)
    expect(tr.at(-1)).toBe(1)
  })

  it('реплики длиннее плана: кольцо ждёт на потолке отрезка, не убегает вперёд, на стыке продолжает; хвост ползёт не выше CREEP_CAP', () => {
    const tr = simulate(D, [3500, 4500, 2500])
    for (let i = 1; i < tr.length; i += 1) expect(tr[i]).toBeGreaterThanOrEqual(tr[i - 1] - 1e-9)
    expect(Math.max(...tr.slice(0, -30))).toBeLessThanOrEqual(CREEP_CAP + 1e-9)
    expect(tr.at(-1)).toBe(1)
  })

  it('реплика длиннее плана: кольцо НЕ стоит на потолке отрезка — всё время ползёт (нет «стоянки» дольше 100 мс до конца)', () => {
    const tr = simulate([2000, 2000], [6000, 6000])
    let flat = 0
    let maxFlat = 0
    for (let i = 1; i < tr.length - 40; i += 1) { flat = tr[i] - tr[i - 1] > 1e-9 ? 0 : flat + 10; maxFlat = Math.max(maxFlat, flat) }
    expect(maxFlat).toBeLessThanOrEqual(100)
    for (let i = 1; i < tr.length; i += 1) expect(tr[i]).toBeGreaterThanOrEqual(tr[i - 1] - 1e-9)
  })

  it('пауза замораживает значение, продолжение идёт дальше от него (без отката и скачка)', () => {
    const tr = simulate(D, D, { pauses: [{ line: 1, at: 1000, len: 2000 }] })
    for (let i = 1; i < tr.length; i += 1) expect(tr[i]).toBeGreaterThanOrEqual(tr[i - 1] - 1e-9)
    // во время паузы значение стоит
    let flat = 0
    for (let i = 1; i < tr.length; i += 1) if (tr[i] === tr[i - 1]) flat += 1
    expect(flat).toBeGreaterThanOrEqual(150) // ≈ 2000 мс / 10
    expect(tr.at(-1)).toBe(1)
  })

  it('пауза: value замирает ровно в момент паузы', () => {
    const tl = createProgressTimeline()
    tl.onState({ status: 'playing', index: 0, run: 1 }, { durations: D, now: 0 })
    const v = tl.value(700)
    const r = tl.onState({ status: 'paused', index: 0, run: 1 }, { durations: D, now: 700 })
    expect(r).toEqual({ from: v, steps: [] })
    expect(tl.value(5000)).toBe(v)
  })

  it('новый проход после конца: откат к 0 за REWIND_MS и снова вперёд; idle сбрасывает мгновенно', () => {
    const tl = createProgressTimeline()
    tl.onState({ status: 'playing', index: 0, run: 1 }, { durations: [1000], now: 0 })
    tl.onState({ status: 'ended', index: 0, run: 1 }, { durations: [1000], now: 1000 })
    expect(tl.value(1000 + END_MS + 10)).toBe(1)
    const r = tl.onState({ status: 'playing', index: 0, run: 2 }, { durations: [1000], now: 3000 })
    expect(r.from).toBe(1)
    expect(r.steps[0]).toEqual({ to: 0, ms: REWIND_MS })
    expect(tl.value(3000 + REWIND_MS)).toBe(0)
    expect(tl.onState({ status: 'idle', index: 0, run: 0 }, { durations: [1000], now: 9000 })).toEqual({ from: 0, steps: [] })
  })

  it('сцена из одной реплики с loop: каждый новый run — новый проход (кольцо не залипает на потолке)', () => {
    const tl = createProgressTimeline()
    tl.onState({ status: 'playing', index: 0, run: 1 }, { durations: [1000], now: 0 })
    const r = tl.onState({ status: 'playing', index: 0, run: 2 }, { durations: [1000], now: 1000 })
    expect(r.steps[0].to).toBe(0) // откат
    expect(r.steps[1].to).toBeLessThanOrEqual(LAST_CAP)
  })

  it('вход в середину (экран открыт на 3-й реплике): кольцо сразу на доле уже сыгранного, не с нуля', () => {
    const tl = createProgressTimeline()
    tl.onState({ status: 'idle', index: 2, run: 0 }, { durations: D, now: 0 })
    const r = tl.onState({ status: 'playing', index: 2, run: 1 }, { durations: D, now: 50 })
    expect(r.from).toBeCloseTo(5000 / 6500, 4)
    expect(r.steps.at(-1).to).toBeLessThanOrEqual(CREEP_CAP)
  })

  it('рассинхрон с идеальным режиссёром ≤ 100 мс: прогресс(t) совпадает с долей времени сцены', () => {
    // эталон: доля = (t - t0) / сумма реальных длительностей; кольцо в «идеальном проходе» не отстаёт больше 100 мс
    const tr = simulate(D, D, { sample: 10 })
    const total = 6500
    let worst = 0
    tr.forEach((v, i) => {
      const t = (i + 1) * 10
      if (t > total) return
      const ideal = t / total
      worst = Math.max(worst, Math.abs(v - ideal) * total) // отклонение в мс
    })
    expect(worst).toBeLessThanOrEqual(100)
  })
})
