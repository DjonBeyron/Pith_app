import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sparkColors, POP_FRAMES, POP_MS, FLASH_MS } from './wordLaneSnap.js'
import { makeParticle } from '../../../../shared/lib/burstParticles.js'
import { normalizeFills, fillsFromTimings, defaultFills } from './wordLanePlan.js'

// Таймлайн слова по озвучке ElevenLabs (wordLanePlan.js) и щелчок пилюли (wordLaneSnap.js)
describe('озвучка ElevenLabs и таймлайн ноды', () => {
  // ElevenLabs: слова с секундой начала. «try. try. try.» — три слова с паузами
  const timings = [{ w: 'try.', t: 0.1 }, { w: 'try.', t: 1.4 }, { w: 'try.', t: 2.9 }]
  const withEnd = [{ w: 'try.', t: 0.1, e: 0.7 }, { w: 'try.', t: 1.4, e: 1.9 }, { w: 'try.', t: 2.9, e: 3.6 }]

  it('есть конец слова (ElevenLabs e) — клип ровно по речи, а не по паузе до следующего слова', () => {
    expect(fillsFromTimings(withEnd, 'try', 4)).toEqual([{ start: 0.1, end: 0.7 }, { start: 1.4, end: 1.9 }, { start: 2.9, end: 3.6 }])
  })

  it('клипы без конца слова берутся из таймингов: начало слова → начало следующего; у последнего — длина по умолчанию или конец файла', () => {
    expect(fillsFromTimings(timings, 'try', 4)).toEqual([{ start: 0.1, end: 1.4 }, { start: 1.4, end: 2.9 }, { start: 2.9, end: 3.7 }])
    expect(fillsFromTimings(timings, 'try', 3.2).at(-1)).toEqual({ start: 2.9, end: 3.2 })
  })

  it('меньше трёх вхождений или чужое слово — null (расставляет автор)', () => {
    expect(fillsFromTimings(timings.slice(0, 2), 'try')).toBeNull()
    expect(fillsFromTimings(timings, 'cat')).toBeNull()
    expect(fillsFromTimings(null, 'try')).toBeNull()
    expect(fillsFromTimings([{ w: 'Try,', t: 0 }, { w: 'Try', t: 1 }, { w: 'try', t: 2 }, { w: 'try', t: 3 }], 'try')).toHaveLength(3)
  })

  it('фраза из двух слов ищется подряд', () => {
    const t = ['get', 'up', 'get', 'up', 'get', 'up'].map((w, i) => ({ w, t: i }))
    expect(fillsFromTimings(t, 'get up').map(c => c.start)).toEqual([0, 2, 4])
  })

  it('normalizeFills: нужны ровно три нормальных клипа', () => {
    expect(normalizeFills(defaultFills(6))).toHaveLength(3)
    expect(normalizeFills([{ start: 1, end: 2 }])).toBeNull()
    expect(normalizeFills([{ start: 1, end: 1 }, { start: 2, end: 3 }, { start: 3, end: 4 }])).toBeNull()
    expect(normalizeFills(null)).toBeNull()
  })




})


describe('щелчок пилюли', () => {
  it('цвета искр — цвет пилюли (ступень «Моей памяти»), светлый тон и белый', () => {
    expect(sparkColors(0)).toEqual(['#b6fe3b', '#e6ff9e', '#ffffff'])
    expect(sparkColors(1)[0]).toBe('#4fb3ee')
    expect(sparkColors(2)[0]).toBe('#9a76f8')
  })

  it('хлопок: 1 → 1.12 → 1 через отдельное свойство scale (положение пилюли остаётся за движком), плавнее первой версии', () => {
    const scales = POP_FRAMES.map(f => f.scale)
    expect(scales[0]).toBe(1)
    expect(scales.at(-1)).toBe(1)
    expect(Math.max(...scales)).toBe(1.12)
    POP_FRAMES.forEach(f => expect(f.transform).toBeUndefined())
    expect(POP_MS).toBeGreaterThanOrEqual(600)
    expect(FLASH_MS).toBeGreaterThanOrEqual(800)
  })

  it('локальные искры: рождаются в точке пилюли и живут короче салюта', () => {
    const origin = { x: 200, y: 300, spread: 40, life: 0.5, reach: 300 }
    for (let i = 0; i < 30; i++) {
      const p = makeParticle(390, 300, 3.5, ['#fff'], origin)
      expect(p.left).toBeGreaterThanOrEqual(180)
      expect(p.left).toBeLessThanOrEqual(220)
    }
    const mean = fn => Array.from({ length: 60 }, fn).reduce((a, b) => a + b, 0) / 60 // у частиц случайный разброс — сравниваем средние
    const local = mean(() => makeParticle(390, 300, 3.5, ['#fff'], origin).duration)
    const full = mean(() => makeParticle(390, 844, 3.5, ['#fff']).duration)
    expect(local).toBeLessThan(full * 0.8)
    // без origin залп прежний — от нижнего края по всей ширине
    expect(makeParticle(390, 844, 4, ['#fff']).left).toBeGreaterThanOrEqual(390 * 0.2)
  })

  it('движок зовёт щелчок один раз на пилюлю: у диктора — с упреждением к концу слова, у ученика — на событии snap конвейера', () => {
    const eng = readFileSync(fileURLToPath(new URL('./useWordLanePills.js', import.meta.url)), 'utf8')
    expect(eng).toContain('h.snapped = true')
    expect(eng).toContain("e.type === 'snap'")
    expect(eng).toContain('snapPill(pool.el(k), e.pill.lane, { full: e.pill.piece === 0 })')   // вспышка и искры — один раз на повтор, у остальных кусков только хлопок
  })
})
