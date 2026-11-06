import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pillParts, passScore, wordAccuracy, withAccuracy, accLevel, pillLifeMs, W_RESULT, W_SPEED, W_CLEAN, R_AFTER_MISS, EXTRA_PENALTY, EXTRA_RECOVER } from './raceAccuracy.js'
import { accNote, accLogLine } from './raceAccuracyNote.js'
import { FILL_CAP } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Точность слова итога (raceAccuracy.js): результат, скорость, чистота, дополнительный круг; расшифровка (raceAccuracyNote.js)
const LIFE = 4000
const ok = (ms, o = {}) => ({ hit: true, miss: false, ms, life: LIFE, fill: FILL_CAP, ...o })
const pass = (words, results, r2 = null) => ({ words, results, r2 })

describe('точность пилюли: результат, скорость, чистота', () => {
  it('мгновенный зачёт с первой попытки, голос налил до потолка — 1; молчал / не успел — 0', () => {
    expect(pillParts(ok(0)).p).toBe(1)
    expect(pillParts({ hit: false, miss: true }).p).toBe(0)
    expect(pillParts(undefined).p).toBe(0)
  })
  it('скорость: 1 − ms / окно жизни пилюли; быстрее — выше', () => {
    const half = pillParts(ok(LIFE / 2))
    expect(half.s).toBeCloseTo(0.5); expect(half.p).toBeCloseTo(W_RESULT + W_SPEED * 0.5 + W_CLEAN)
    expect(pillParts(ok(500)).p).toBeGreaterThan(pillParts(ok(2500)).p)
    expect(pillParts(ok(LIFE * 2)).s).toBe(0) // позже окна (запас) — не меньше 0
  })
  it('зачёт после промаха: результат вдвое меньше, чистота −50 %', () => {
    const r = pillParts(ok(0, { miss: true, wrong: 1 }))
    expect(r.r).toBe(R_AFTER_MISS); expect(r.c).toBeCloseTo(0.5); expect(r.p).toBeCloseTo(W_RESULT * R_AFTER_MISS + W_SPEED + W_CLEAN * 0.5)
  })
  it('чистота: голос — доля заливки пилюли; тап — без ошибочных тапов (заливка не важна)', () => {
    expect(pillParts(ok(0, { fill: 0 })).c).toBeCloseTo(0.5)
    expect(pillParts(ok(0, { tap: true, fill: 0 })).c).toBe(1)
    expect(pillParts(ok(0, { tap: true, wrong: 1, miss: true })).c).toBeCloseTo(0.5)
    expect(pillParts(ok(0, { tap: true, wrong: 3, miss: true })).c).toBe(0)
  })
  it('нет времени, окна и заливки (старые результаты) — без NaN', () => {
    const r = pillParts({ hit: true, miss: false })
    expect(Number.isFinite(r.p)).toBe(true); expect(r.s).toBe(0.5); expect(r.c).toBe(1)
  })
  it('ловушка прохода B: промолчал — 1, поверил — 0', () => {
    expect(pillParts({ hit: true, miss: false, trap: true }).p).toBe(1)
    expect(pillParts({ hit: true, miss: true, trap: true, believed: true }).p).toBe(0)
  })
  it('окно жизни пилюли: быстрее пилюля — короче окно', () => {
    expect(pillLifeMs(1)).toBeGreaterThan(4000); expect(Math.abs(pillLifeMs(2) - pillLifeMs(1) / 2)).toBeLessThanOrEqual(1); expect(pillLifeMs(0)).toBe(pillLifeMs(1))
  })
})

describe('проход и слово: дополнительный круг, оба прохода, граничные случаи', () => {
  it('дополнительный круг: штраф и частичное восстановление; справился лучше, чем не справился', () => {
    const fail = { hit: false, miss: true }
    const won = passScore(pass(['a', 'b'], { 0: fail, 1: ok(0) }, { words: ['a'], results: { 0: ok(0) } }), 'a')
    expect(won.score).toBeCloseTo(-EXTRA_PENALTY + EXTRA_RECOVER); expect(won.extra.done).toBe(true)
    const lost = passScore(pass(['a'], { 0: fail }, { words: ['a'], results: { 0: fail } }), 'a')
    expect(lost.score).toBe(0); expect(lost.extra.done).toBe(false)
  })
  it('удавшееся слово, взятое в доп. круг добором, результатом круга не меняется', () => {
    const p = passScore(pass(['a'], { 0: ok(0) }, { words: ['a'], results: { 0: { hit: false, miss: true } } }), 'a')
    expect(p.score).toBe(1); expect(p.extra).toBeNull()
  })
  it('слово в обоих проходах — среднее; только в одном — по нему; дежурное слово (только доп. круг) — по кругу; нигде — 0', () => {
    const race = { sprint: pass(['a', 'b'], { 0: ok(0), 1: ok(0) }, { words: ['z'], results: { 0: ok(LIFE / 2) } }), catch: pass(['a'], { 0: { hit: false, miss: true } }) }
    expect(wordAccuracy(race, 'a').pct).toBe(50)
    expect(wordAccuracy(race, 'b')).toMatchObject({ pct: 100, level: 4, b: null })
    expect(wordAccuracy(race, 'z').pct).toBe(Math.round(100 * (W_RESULT + W_SPEED * 0.5 + W_CLEAN)))
    expect(wordAccuracy(race, 'нет')).toMatchObject({ pct: 0, level: 0, a: null, b: null })
    expect(wordAccuracy(null, 'a').pct).toBe(0)
  })
  it('уровни цвета: < 40 — 0, 40 — 1, 55 — 2, 70 — 3, 85 — 4', () => {
    expect([0, 39, 40, 54, 55, 69, 70, 84, 85, 100].map(accLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
  it('список итога: слабые сверху, при равном счёте — меньшая точность выше', () => {
    const race = { sprint: pass(['a', 'b', 'c'], { 0: ok(3000), 1: ok(0), 2: { hit: false, miss: true } }), catch: pass([], {}) }
    const rows = withAccuracy(race, [{ text: 'b', score: 0 }, { text: 'a', score: 0 }, { text: 'c', score: 2 }])
    expect(rows.map(w => w.text)).toEqual(['c', 'a', 'b']); expect(rows.every(w => Number.isFinite(w.acc.pct))).toBe(true)
  })
  it('детерминировано: без случайности и часов', () => {
    for (const f of ['./raceAccuracy.js', './raceAccuracyNote.js']) expect(readFileSync(new URL(f, import.meta.url), 'utf8')).not.toMatch(/Math\.random|Date\.now|performance\.now/)
  })
})

describe('расшифровка и строка журнала', () => {
  it('«A 1,8 с · B промах · доп. круг ✓»', () => {
    const race = { sprint: pass(['a'], { 0: ok(1800) }), catch: pass(['a'], { 0: { hit: false, miss: true, wrong: 1 } }, { words: ['a'], results: { 0: ok(900) } }) }
    expect(accNote(wordAccuracy(race, 'a'))).toBe('A 1,8 с · B промах · доп. круг ✓')
  })
  it('после промаха, не успел, ловушка, оба доп. круга', () => {
    const f = { hit: false, miss: true }
    const race = { sprint: pass(['a'], { 0: f }, { words: ['a'], results: { 0: f } }), catch: pass(['a'], { 0: ok(1200, { miss: true, wrong: 1 }) }, { words: ['a'], results: { 0: ok(500) } }) }
    expect(accNote(wordAccuracy(race, 'a'))).toBe('A не успел · B после промаха 1,2 с · доп. круг A ✗ B ✓')
    expect(accNote(wordAccuracy({ catch: pass(['t'], { 0: { hit: true, miss: false, trap: true } }) }, 't'))).toBe('B ловушка ✓')
    expect(accNote(null)).toBe('')
  })
  it('строка журнала: слово, процент, расшифровка', () => {
    const race = { sprint: pass(['a'], { 0: ok(1800) }) }
    expect(accLogLine({ text: 'a', acc: wordAccuracy(race, 'a') })).toMatch(/^итог: «a» \d+ % \(A 1,8 с\)$/)
    expect(accLogLine({ text: 'x' })).toBe('итог: «x» 0 %')
  })
})
