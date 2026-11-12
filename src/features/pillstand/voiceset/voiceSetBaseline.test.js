import { describe, it, expect } from 'vitest'
import { aggregate, compareBaseline } from './voiceSetBaseline.js'

// Базовая линия набора: подсчёт по видам и сверка (регрессия — «верно» стало меньше).
const word = (variant, expect, hit, extra = {}) => ({ kind: 'word', variant, expect, hit, ...extra })

describe('базовая линия набора', () => {
  const rows = [word('whole', 'hit', true), word('whole', 'hit', true), word('whole', 'hit', false), word('nolast', 'none', false), word('nolast', 'none', true),
    { kind: 'phrase', variant: 'whole', expect: 'hit', hit: true, ratio: 1 }, { kind: 'noise', variant: 'noise', expect: 'none', hit: false }]
  it('считает «верно / всего» по видам; фраза «whole» — отдельный вид', () => {
    expect(aggregate(rows)).toEqual({ whole: { ok: 2, total: 3 }, nolast: { ok: 1, total: 2 }, 'phrase whole': { ok: 1, total: 1 }, noise: { ok: 1, total: 1 } })
  })
  it('сверка: меньше — регрессия, больше — «лучше», другое число клипов — «не сравнить»', () => {
    const base = { whole: { ok: 3, total: 3 }, nolast: { ok: 1, total: 2 }, noise: { ok: 1, total: 1 }, long: { ok: 2, total: 2 } }
    const got = compareBaseline(base, aggregate(rows))
    expect(got.regress).toEqual(['whole: верно 2 из 3, в линии 3'])
    expect(got.better).toEqual([])
    expect(got.missing).toEqual(['long'])
    expect(compareBaseline({ nolast: { ok: 0, total: 2 } }, aggregate(rows)).better).toHaveLength(1)
    expect(compareBaseline({ whole: { ok: 1, total: 5 } }, aggregate(rows)).missing[0]).toContain('клипов 3, в линии 5')
  })
})
