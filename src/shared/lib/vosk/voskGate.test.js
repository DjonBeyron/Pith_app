import { describe, it, expect } from 'vitest'
import { createGate, GATE_RMS, GATE_KEEP_MS } from './voskGate.js'

const MS = 128
const run = (g, list, opts) => list.map(r => g.push(r, MS, opts))

describe('voskGate: долгую тишину декодеру не отдаём', () => {
  it('голос и тихий, но не нулевой звук проходят; тишину отдаём не дольше GATE_KEEP_MS, дальше режем', () => {
    const g = createGate()
    expect(run(g, [0.2, GATE_RMS, 0.02]).every(x => x.feed)).toBe(true)
    const quiet = run(createGate(), Array(10).fill(0))
    const fed = quiet.filter(x => x.feed).length * MS
    expect(fed).toBeGreaterThanOrEqual(GATE_KEEP_MS)
    expect(fed).toBeLessThan(500) // короче самого короткого правила эндпойнта Vosk
    expect(quiet.slice(3).every(x => !x.feed)).toBe(true)
  })
  it('голос вернулся после обрезанной паузы: предыдущий (не отданный) кусок уходит предзвуком; счётчик пропущенного его не включает', () => {
    const g = createGate()
    run(g, Array(10).fill(0)) // 3 отдано, 7 пропущено
    expect(g.droppedMs).toBe(7 * MS)
    const back = g.push(0.1, MS)
    expect(back).toEqual({ feed: true, preroll: true })
    expect(g.droppedMs).toBe(6 * MS)
    expect(g.push(0.1, MS).preroll).toBe(false)
  })
  it('любой громкий кусок обнуляет счёт тишины: паузы по 0,3 с, разделённые звуком, не режутся', () => {
    const g = createGate()
    const out = []
    for (let i = 0; i < 6; i++) out.push(g.push(0, MS), g.push(0, MS), g.push(0.05, MS))
    expect(out.every(x => x.feed && !x.preroll)).toBe(true)
    expect(g.droppedMs).toBe(0)
  })
  it('open (фраза услышана вся) — затвор открыт: пусть движок заканчивает сам', () => {
    const g = createGate()
    expect(run(g, Array(10).fill(0), { open: true }).every(x => x.feed)).toBe(true)
    expect(g.droppedMs).toBe(0)
  })
})
