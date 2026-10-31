import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { hashSeed, mulberry32, rngFor, rngInt, rngBool, rngPick, rngShuffle, seedFor, todayIso, cleanSeed, newSeed } from './rehearsalSeed.js'
import { normalizePlan } from './rehearsalPlan.js'

const take = (rng, n) => Array.from({ length: n }, () => rng())

// Семя и генератор случайности внутри актов (CONCEPT_REHEARSAL.md §8): одно семя — одна последовательность, разные — разные; без Math.random
describe('генератор', () => {
  it('одно семя — одна последовательность, другое — другая; числа в [0, 1)', () => {
    expect(take(rngFor('s', 'warmup'), 8)).toEqual(take(rngFor('s', 'warmup'), 8))
    expect(take(rngFor('s', 'warmup'), 8)).not.toEqual(take(rngFor('t', 'warmup'), 8))
    expect(take(rngFor('s', 'warmup'), 8)).not.toEqual(take(rngFor('s', 'build'), 8)) // у каждого акта свой поток
    expect(take(mulberry32(hashSeed('x')), 200).every(v => v >= 0 && v < 1)).toBe(true)
    expect(hashSeed('2026-10-30|I\'m | trying | to learn')).toBe(hashSeed('2026-10-30|I\'m | trying | to learn'))
  })
  it('распределение ровное: 3000 семян по трём вариантам — каждый около трети; монета — около половины', () => {
    const cnt = [0, 0, 0]
    let heads = 0
    for (let i = 0; i < 3000; i++) { const r = rngFor(`2026-10-${i % 28}|фраза ${i}`, 'x'); cnt[rngInt(r, 3)]++; if (rngBool(r)) heads++ }
    for (const c of cnt) expect(c).toBeGreaterThan(850)
    expect(heads).toBeGreaterThan(1300); expect(heads).toBeLessThan(1700)
  })
  it('rngPick и rngShuffle: из списка; перемешивание сохраняет состав, копия, воспроизводимо', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(list).toContain(rngPick(rngFor('p'), list))
    const sh = rngShuffle(rngFor('p'), list)
    expect([...sh].sort()).toEqual(list); expect(sh).not.toBe(list); expect(list).toEqual(['a', 'b', 'c', 'd'])
    expect(rngShuffle(rngFor('p'), list)).toEqual(sh)
    expect(rngInt(() => 0.9999999, 3)).toBe(2); expect(rngInt(() => 0, 0)).toBe(0)
  })
  it('Math.random в коде репетиции не используется — выборы только из семени', () => {
    const files = ['rehearsalSeed.js', 'rehearsalVariety.js', 'rehearsalDiscern.js', 'rehearsalRecipe.js', 'rehearsalStages.js', 'rehearsalLines.js', 'rehearsalHints.js', 'useRehearsalActs.js', 'mirror/mirrorNotes.js']
    for (const f of files) expect(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), f).not.toContain('Math.random')
  })
})

describe('семя плана', () => {
  it('по умолчанию — «дата|фраза» (дата по местному времени); одна фраза в один день — одно семя, на другой день — другое', () => {
    expect(todayIso(new Date(2026, 9, 5))).toBe('2026-10-05')
    expect(seedFor('a | b', '2026-10-30')).toBe('2026-10-30|a | b')
    const p = normalizePlan({ phrase: 'a | b' })
    expect(p.seed).toBe(seedFor('a | b', todayIso()))
    expect(seedFor('a | b', '2026-10-30')).not.toBe(seedFor('a | b', '2026-10-31'))
    expect(seedFor('a | b', '2026-10-30')).not.toBe(seedFor('a | c', '2026-10-30'))
  })
  it('из JSON плана семя переопределяется (обрезается, число тоже годится); пустое — снова по дате', () => {
    expect(normalizePlan({ phrase: 'a | b', seed: '  мой  ' }).seed).toBe('мой')
    expect(normalizePlan({ phrase: 'a | b', seed: 7 }).seed).toBe('7')
    expect(normalizePlan({ phrase: 'a | b', seed: '   ' }).seed).toBe(seedFor('a | b'))
    expect(cleanSeed({})).toBeNull(); expect(cleanSeed('x'.repeat(200))).toHaveLength(80)
  })
  it('newSeed («Новое»): каждый раз другое и непустое', () => {
    const a = newSeed(1000), b = newSeed(1000)
    expect(a).not.toBe(b); expect(a.length).toBeGreaterThan(2)
  })
})
