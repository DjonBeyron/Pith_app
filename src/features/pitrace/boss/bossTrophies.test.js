import { describe, it, expect } from 'vitest'
import { TROPHY_PER_WORD, ZONE_SHARE, FREE_PCT, MID_PCT, wordTrophies, outcomeOf, examTrophies } from './bossTrophies.js'

// Экзамен «Шкала памяти», правила владельца 2026-11-24 «трофеи на кону»: доля трофеев слова по зоне ответа, ошибка и молчание — 0, потерянное у Мии; исход — по доле собранного (границы 40 % и 70 %).
const ok = zone => ({ ok: true, zone }), no = { ok: false }

describe('трофеи слова по зоне', () => {
  it('числа правил лежат в одном месте: зелёная 1, жёлтая 0,5, красная 0,15; пороги 70 % и 40 %', () => {
    expect(ZONE_SHARE).toEqual({ fast: 1, mid: 0.5, slow: 0.15 }); expect([FREE_PCT, MID_PCT]).toEqual([70, 40])
  })
  it('зелёная — всё, жёлтая — половина, красная — почти ничего (но не ноль: ответ верный); все три — целые числа', () => {
    expect(wordTrophies(ok('fast'))).toBe(TROPHY_PER_WORD); expect(wordTrophies(ok('mid'))).toBe(TROPHY_PER_WORD / 2)
    expect(wordTrophies(ok('slow'))).toBe(Math.round(TROPHY_PER_WORD * 0.15)); expect(wordTrophies(ok('slow'))).toBeGreaterThan(0)
    for (const z of ['fast', 'mid', 'slow']) expect(Number.isInteger(TROPHY_PER_WORD * ZONE_SHARE[z])).toBe(true)
  })
  it('ошибка, молчание и «слова нет» — 0; верный ответ без зоны (принят раньше, чем пилюля коснулась шкалы) — зелёная', () => {
    expect(wordTrophies(no)).toBe(0); expect(wordTrophies(null)).toBe(0); expect(wordTrophies({ ok: false, zone: 'fast' })).toBe(0)
    expect(wordTrophies({ ok: true })).toBe(TROPHY_PER_WORD)
  })
})

describe('исход по доле собранного', () => {
  it('границы: ровно 70 % — Пит свободен, Мия уходит; ровно 40 % — Пит свободен, потерянное у Мии; чуть меньше 40 % — Пит остаётся', () => {
    expect(outcomeOf(70, 100)).toBe('free'); expect(outcomeOf(69, 100)).toBe('mid')
    expect(outcomeOf(40, 100)).toBe('mid'); expect(outcomeOf(39, 100)).toBe('stay')
    expect(outcomeOf(84, 120)).toBe('free'); expect(outcomeOf(83, 120)).toBe('mid') // 6 слов: 84 из 120 — ровно 70 %
    expect(outcomeOf(48, 120)).toBe('mid'); expect(outcomeOf(47, 120)).toBe('stay') // 48 из 120 — ровно 40 %
    expect(outcomeOf(0, 120)).toBe('stay'); expect(outcomeOf(120, 120)).toBe('free')
  })
})

describe('итог экзамена: ответы → трофеи, доля, исход', () => {
  const T = TROPHY_PER_WORD
  it('все зелёные — максимум, у Мии ничего; всё молча — у Мии всё', () => {
    expect(examTrophies(Array(6).fill(ok('fast')))).toMatchObject({ max: 6 * T, got: 6 * T, lost: 0, pct: 100, outcome: 'free' })
    expect(examTrophies(Array(6).fill(no))).toMatchObject({ max: 6 * T, got: 0, lost: 6 * T, pct: 0, outcome: 'stay' })
  })
  it('потерянное = максимум за слово минус полученное, и оно у Мии: жёлтое слово отдаёт половину, красное — почти всё, ошибка — всё', () => {
    const r = examTrophies([ok('fast'), ok('mid'), ok('slow'), no])
    expect(r.words).toEqual([T, T / 2, 3, 0]); expect(r.got).toBe(T + T / 2 + 3); expect(r.lost).toBe(4 * T - r.got); expect(r.got + r.lost).toBe(r.max)
  })
  it('красная зона верна, но режет трофеи: шесть верных ответов в красной зоне — 15 %, Пит остаётся', () => {
    expect(examTrophies(Array(6).fill(ok('slow')))).toMatchObject({ got: 18, max: 120, pct: 15, outcome: 'stay' })
  })
  it('три исхода на шести словах', () => {
    expect(examTrophies([ok('fast'), ok('fast'), ok('mid'), ok('fast'), ok('fast'), ok('mid')])).toMatchObject({ got: 100, pct: 83, outcome: 'free' })
    expect(examTrophies([ok('fast'), ok('fast'), ok('mid'), ok('slow'), no, no])).toMatchObject({ got: 53, lost: 67, pct: 44, outcome: 'mid' })
    expect(examTrophies([ok('mid'), no, no, ok('slow'), no, no])).toMatchObject({ got: 13, lost: 107, pct: 10, outcome: 'stay' })
  })
  it('пока экзамен идёт: слова впереди входят в максимум, но ещё ничьи (у Мии только то, что уже потеряно)', () => {
    const r = examTrophies([ok('fast'), no, null, null], 4)
    expect(r).toMatchObject({ max: 4 * T, got: T, lost: T })
  })
  it('пустой экзамен ничего не ломает', () => { expect(examTrophies([])).toMatchObject({ max: 0, got: 0, lost: 0, pct: 0 }); expect(examTrophies(null)).toMatchObject({ max: 0 }) })
})
