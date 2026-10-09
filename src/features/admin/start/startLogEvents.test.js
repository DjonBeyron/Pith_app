import { describe, it, expect } from 'vitest'
import { fmtT, sortEvents, parseKv, replaySamples, splashLineEvents, collapseTicks, fullEvents } from './startLogEvents.js'

describe('startLogEvents', () => {
  it('fmtT: до 100 мс — до одной цифры после запятой, дальше целые', () => {
    expect([fmtT(3), fmtT(12.34), fmtT(99.96), fmtT(100.4), fmtT(1234.6)]).toEqual(['3', '12.3', '100', '100', '1235'])
  })
  it('sortEvents: по времени, при равенстве — по порядку записи, исходный массив не меняется', () => {
    const src = [[5, 'b', ''], [1, 'a', ''], [5, 'a2', '']]
    expect(sortEvents(src).map(e => e[1])).toEqual(['a', 'b', 'a2'])
    expect(src[0][1]).toBe('b')
  })
  it('parseKv', () => {
    expect(parseKv('bg=rgb(0,0,0) fd=0.5 lg=1,2,3x4')).toEqual({ bg: 'rgb(0,0,0)', fd: '0.5', lg: '1,2,3x4' })
    expect(parseKv('')).toEqual({})
    expect(parseKv(undefined)).toEqual({})
  })
  it('replaySamples: дельты собираются в полное состояние, до и после изменения', () => {
    const out = replaySamples([[30, 'sample', 'fd=1'], [10, 'sample', 'a=1 fd=0'], [20, 'tick', '='], [40, 'sample', 'a=2']])
    expect(out.map(s => s.t)).toEqual([10, 30, 40])
    expect(out[1]).toMatchObject({ state: { a: '1', fd: '1' }, changed: { fd: '1' }, prev: { a: '1', fd: '0' } })
    expect(out[2].state).toEqual({ a: '2', fd: '1' })
  })
  it('splashLineEvents: секунды → мс, строки без метки пропускаются', () => {
    expect(splashLineEvents(['[0.04] splash: а', '[12.5] б', 'мусор', null])).toEqual([[40, 'splash-log', 'splash: а'], [12500, 'splash-log', 'б']])
    expect(splashLineEvents(undefined)).toEqual([])
  })
  it('collapseTicks: подряд идущие tick → одна запись; одиночный остаётся', () => {
    const out = collapseTicks([[1, 'a', 'x'], [100, 'tick', '='], [200, 'tick', '='], [210, 'sample', 'k=1'], [300, 'tick', '=']])
    expect(out).toEqual([
      { t: 1, type: 'a', detail: 'x' }, { tick: true, n: 2, t: 100, to: 200 },
      { t: 210, type: 'sample', detail: 'k=1' }, { tick: true, n: 1, t: 300, to: 300 },
    ])
  })
  it('fullEvents: события + журнал сплэша на одной шкале', () => {
    const e = fullEvents({ ev: [[50, 'x', ''], [5, 'y', '']], splash: ['[0.02] s'] })
    expect(e.map(x => x[1])).toEqual(['y', 'splash-log', 'x'])
  })
})
