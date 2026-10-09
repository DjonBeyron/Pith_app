import { describe, it, expect } from 'vitest'
import { thresholdTable, recommend, confSpread, spreadText, thresholdLines, CONF_THRESHOLDS } from './voskThreshold.js'

const ctl = (kc, out = 'asis') => ({ kind: 'ctx', mode: 'control', out, kc, ws: [['x', kc, 0, 1]] })
const err = (out, kc, sw = null) => ({ kind: 'ctx', mode: 'error', out, kc, sw, keys: { ok: 'trying' }, ws: [['x', kc, 0, 1]] })
const trap = (out, kc) => ({ kind: 'trap', mode: 'trap', out, kc, ws: kc != null ? [['try', kc, 0, 1]] : [] })

describe('порог уверенности слова', () => {
  it('пороги 0.3 / 0.5 / 0.7 / 0.9', () => { expect(CONF_THRESHOLDS).toEqual([0.3, 0.5, 0.7, 0.9]) })
  const runs = [
    ctl(0.95), ctl(0.88), ctl(0.6), ctl(0.4), ctl(null, 'swapped'), // 4 услышаны верно, одна подменена
    err('swapped', 0.45, 'trying'), err('swapped', 0.92, 'trying'), err('asis', 0.99), err('swapped', 0.8, 'tried'), // «tried» — не верная форма
    trap('accepted', 0.35), trap('rejected', null), trap('empty', null), trap('accepted', 0.6),
  ]
  const tab = thresholdTable(runs)
  it('считает верных/неверных', () => {
    expect(tab.nRight).toBe(5)
    expect(tab.nWrong).toBe(8)
  })
  it('по порогам: принято / отвергнуто / ложные отказы', () => {
    const by = Object.fromEntries(tab.rows.map(r => [r.t, r]))
    // неверно принятые: err swapped→ok: 0.45, 0.92; trap accepted: 0.35, 0.6
    expect(by[0.3]).toEqual({ t: 0.3, accepted: 4, rejected: 4, refused: 0 })
    expect(by[0.5]).toEqual({ t: 0.5, accepted: 3, rejected: 6, refused: 1 }) // 0.45 и 0.35 отсечены; верное 0.4 отвергнуто
    expect(by[0.7]).toEqual({ t: 0.7, accepted: 2, rejected: 7, refused: 2 })
    expect(by[0.9]).toEqual({ t: 0.9, accepted: 1, rejected: 7, refused: 3 })
  })
  it('совет: без ложных отказов — максимум отвергнутого', () => {
    const r = recommend(tab)
    expect(r.t).toBe(0.3)
    expect(r.text).toContain('рекомендуемый порог: 0.3')
  })
  it('совет: порог без ложных отказов, где отвергается больше', () => {
    const t = thresholdTable([ctl(0.95), ctl(0.92), err('swapped', 0.6, 'trying'), trap('accepted', 0.4)])
    const r = recommend(t)
    expect(r.t).toBe(0.7)
    expect(r.text).toBe('рекомендуемый порог: 0.7 — принимает верных 2 из 2, отвергает неверных 2 из 2, ложных отказов нет')
  })
  it('совет: нет верных или неверных прогонов — просит данных', () => {
    expect(recommend(thresholdTable([ctl(0.9)])).t).toBeNull()
    expect(recommend(thresholdTable([trap('accepted', 0.5)])).text).toContain('нужны правильные прогоны')
    expect(recommend(thresholdTable([])).text).toContain('пока нет')
  })
  it('вся уверенность = 1: порог ничего не меняет, и это сказано', () => {
    const same = [ctl(1), err('asis', 1), trap('rejected', null)]
    expect(recommend(thresholdTable(same)).text).toContain('порог ничего не меняет')
    const s = confSpread(same)
    expect(s).toMatchObject({ n: 2, min: 1, max: 1, distinct: 1 })
    expect(spreadText(s)).toContain('НЕ различаются')
  })
  it('разброс уверенности: разные значения', () => {
    const s = confSpread(runs)
    expect(s.min).toBe(0.35)
    expect(s.max).toBe(0.99)
    expect(s.distinct).toBeGreaterThan(5)
    expect(spreadText(s)).toContain('значения различаются')
    expect(spreadText(confSpread([]))).toContain('данных нет')
  })
  it('строки для отчёта', () => {
    const lines = thresholdLines(runs)
    expect(lines[0]).toContain('верных прогонов 5, неверных 8')
    expect(lines.filter(l => l.startsWith('  порог')).length).toBe(4)
  })
  it('слово без уверенности (kc: null) считается принятым: порог не отсекает', () => {
    const t = thresholdTable([ctl(null), trap('accepted', null)])
    expect(t.rows.every(r => r.accepted === 1 && r.rejected === 0 && r.refused === 0)).toBe(true)
  })
})
