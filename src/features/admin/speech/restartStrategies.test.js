import { describe, it, expect } from 'vitest'
import { RESTART_KEY, STRATEGY_INFO, readStrategy, writeStrategy, strategyLabel, isStrategyId } from './restartStrategies.js'
import { STRATEGY_IDS, STRATEGIES } from '../../../shared/lib/speech/speechRestart.js'

function memStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
const broken = () => ({ getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } })

describe('выбор стратегии перезапуска (localStorage pithy_admin_voice_restart_v1)', () => {
  it('ключ хранения и подписи для S1…S5 заданы', () => {
    expect(RESTART_KEY).toBe('pithy_admin_voice_restart_v1')
    for (const id of STRATEGY_IDS) expect(STRATEGY_INFO[id].title).toBeTruthy()
    expect(Object.keys(STRATEGY_INFO)).toEqual(Object.keys(STRATEGIES))
    expect(strategyLabel('S3')).toBe('S3 — Новый экземпляр + пауза 900 мс после end')
  })

  it('по умолчанию S1 (текущее поведение); мусор в хранилище → S1', () => {
    expect(readStrategy(memStore({}))).toBe('S1')
    expect(readStrategy(memStore({ [RESTART_KEY]: 'S9' }))).toBe('S1')
  })

  it('запись и чтение; незнакомый id не записывается', () => {
    const st = memStore()
    expect(writeStrategy('S4', st)).toBe('S4')
    expect(readStrategy(st)).toBe('S4')
    expect(writeStrategy('zzz', st)).toBe('S1')
    expect(readStrategy(st)).toBe('S4')
    expect(isStrategyId('S2')).toBe(true)
    expect(isStrategyId('M')).toBe(false) // «M» — внутренняя стратегия модуля, в пробе не выбирается
  })

  it('localStorage недоступен: выбор живёт в памяти до перезагрузки, ничего не падает', () => {
    expect(writeStrategy('S5', broken())).toBe('S5')
    expect(readStrategy(broken())).toBe('S5')
    writeStrategy('S1', memStore())
  })
})
