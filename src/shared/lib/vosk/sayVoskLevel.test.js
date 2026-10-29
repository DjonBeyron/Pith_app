import { describe, it, expect } from 'vitest'
import { createRmsLevel, LEVEL_DECAY_MS } from './sayVoskLevel.js'
import { levelFromRms } from '../speech/sayRealLevel.js'

describe('sayVoskLevel: RMS кусков звука → уровень 0..1 для эквалайзера', () => {
  it('новый кусок поднимает уровень сразу (формула общая с реальным уровнем пробы), громкий выше тихого', () => {
    const l = createRmsLevel({ now: () => 0 })
    l.push(0.1, 0)
    expect(l.read(0)).toBeCloseTo(levelFromRms(0.1), 5)
    const quiet = l.read(0)
    l.push(0.3, 10)
    expect(l.read(10)).toBeGreaterThan(quiet)
    expect(l.read(10)).toBeLessThanOrEqual(1)
  })
  it('тишина и шум комнаты (ниже пола) — 0; до первого куска — 0', () => {
    const l = createRmsLevel({ now: () => 0 })
    expect(l.read(0)).toBe(0)
    l.push(0.01, 0)
    expect(l.read(0)).toBe(0)
  })
  it('между кусками плавно оседает до нуля за LEVEL_DECAY_MS; reset гасит сразу', () => {
    const l = createRmsLevel({ now: () => 0 })
    l.push(0.2, 0)
    const top = l.read(0)
    expect(l.read(LEVEL_DECAY_MS / 2)).toBeCloseTo(top / 2, 5)
    expect(l.read(LEVEL_DECAY_MS)).toBe(0)
    l.push(0.2, 1000); l.reset()
    expect(l.read(1000)).toBe(0)
  })
  it('новый тихий кусок не обрывает оседание резко (берётся большее), метка кадра раньше куска не даёт отрицательного', () => {
    const l = createRmsLevel({ now: () => 0 })
    l.push(0.3, 0)
    const before = l.read(100)
    l.push(0.03, 100)
    expect(l.read(100)).toBeCloseTo(before, 5)
    expect(l.read(50)).toBeGreaterThanOrEqual(0)
  })
  it('decayMs задаёт спад: линейно от пика, куски тишины его не растягивают; без decayMs спад прежний (LEVEL_DECAY_MS)', () => {
    const fast = createRmsLevel({ now: () => 0, decayMs: 100 })
    fast.push(0.2, 0)
    const top = fast.read(0)
    for (let t = 25; t <= 125; t += 25) fast.push(0, t)
    expect(fast.read(50)).toBeCloseTo(top / 2, 5)
    expect(fast.read(100)).toBe(0)
    const slow = createRmsLevel({ now: () => 0 })
    slow.push(0.2, 0)
    expect(slow.read(LEVEL_DECAY_MS / 2)).toBeCloseTo(top / 2, 5)
  })
  it('свойство fromRms.decayMs подхватывается, явный decayMs его перекрывает', () => {
    const f = Object.assign(rms => rms, { decayMs: 40 })
    const a = createRmsLevel({ now: () => 0, fromRms: f })
    a.push(0.8, 0)
    expect(a.read(40)).toBe(0)
    const b = createRmsLevel({ now: () => 0, fromRms: f, decayMs: 80 })
    b.push(0.8, 0)
    expect(b.read(40)).toBeCloseTo(0.4, 5)
  })
})
