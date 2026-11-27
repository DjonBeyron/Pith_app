import { describe, it, expect } from 'vitest'
import { createMicroFreeze, microKind, MICRO_EVERY_MS } from './microFreeze.js'

// кадры по 16,7 мс; gaps — { на каком кадре: длина }
function run({ frames = 400, slow = {}, events = [] } = {}) {
  const lines = [], m = createMicroFreeze({ log: l => lines.push(l) })
  let t = 1000
  for (let i = 0; i < frames; i++) {
    for (const e of events) if (e.at === i) m.event({ t, k: e.k, res: e.res })
    t += slow[i] ?? 16.7
    m.frame(t)
  }
  return { m, lines, t }
}

describe('microFreeze: микро-фризы возле пилюль', () => {
  it('какие события открывают окно', () => {
    expect(microKind({ k: 'pill' })).toBe('pill')
    expect(microKind({ k: 'claim' })).toBe('claim')
    expect(microKind({ k: 'answer', res: 'win' })).toBe('gone')
    expect(microKind({ k: 'answer', res: 'miss' })).toBeNull()
    expect(microKind({ k: 'note' })).toBeNull()
  })
  it('кадр 34 мс через 3 кадра после улёта — окно с фризом; фриз далеко от событий — только «вне окон»', () => {
    const { m } = run({ slow: { 53: 34, 300: 34 }, events: [{ at: 50, k: 'answer', res: 'win' }] })
    const s = m.stats()
    expect(s.kinds.gone.n).toBe(1) // окно закрылось (+500 мс прошло)
    expect(s.kinds.gone.hit[0]).toBe(1)
    expect(s.in25).toBe(1) // кадр 53
    expect(s.out25).toBe(1) // кадр 300 — вне окон
  })
  it('итог: сколько событий, окон с фризом, кадров ≥25/34/50 и доля вне окон', () => {
    const { m, lines } = run({ slow: { 53: 34, 54: 52, 300: 34 }, events: [{ at: 50, k: 'answer', res: 'win' }, { at: 120, k: 'pill' }] })
    const line = m.summary()
    expect(line).toContain('[micro] итог:')
    expect(line).toContain('улёт ×1: с фризом 1 (100%), кадров ≥25/34/50 мс: 2/2/1')
    expect(line).toContain('выезд ×1: с фризом 0 (0%)')
    expect(line).toMatch(/вне окон кадров \d+ \(≥25 мс: 1,/)
    expect(lines.at(-1)).toBe(line)
    expect(m.summary()).toBeNull() // повторный итог без новой игры не пишется
  })
  it('кадр за 100 мс до события тоже попадает в окно', () => {
    const lines = [], m = createMicroFreeze({ log: l => lines.push(l) })
    let t = 0
    for (let i = 0; i < 100; i++) { t += i === 90 ? 40 : 16.7; m.frame(t) }
    m.event({ t: t + 20, k: 'claim' }) // кадр 90 — за ≈ 150 мс до события (вне окна −100 мс)
    for (let i = 0; i < 60; i++) { t += 16.7; m.frame(t) }
    expect(m.summary()).toContain('слово принято ×1: с фризом 0')
    const m2 = createMicroFreeze({ log: () => {} }); t = 0
    for (let i = 0; i < 100; i++) { t += i === 97 ? 40 : 16.7; m2.frame(t) }
    m2.event({ t: t + 20, k: 'claim' })
    for (let i = 0; i < 60; i++) { t += 16.7; m2.frame(t) }
    expect(m2.summary()).toContain('слово принято ×1: с фризом 1')
  })
  it('пауза: кадры после неё не считаются, огромный кадр (фон) пропускается', () => {
    const m = createMicroFreeze({ log: () => {} })
    let t = 0
    for (let i = 0; i < 200; i++) { t += 16.7; m.frame(t) }
    m.event({ t, k: 'pill' }); m.pause(true); t += 5000; m.pause(false); m.frame(t)
    t += 16.7; m.frame(t)
    t += 9000; m.frame(t)
    expect(m.stats().in25).toBe(0)
    expect(m.stats().out25).toBe(0)
  })
  it('строка раз в MICRO_EVERY_MS, если закрылись окна; без окон строк нет', () => {
    const { lines } = run({ frames: Math.ceil((MICRO_EVERY_MS * 1.6) / 16.7), events: [{ at: 10, k: 'pill' }] })
    expect(lines.filter(l => l.startsWith('[micro] выезд ×1')).length).toBe(1)
    expect(run({ frames: 800 }).lines).toEqual([])
  })
})
