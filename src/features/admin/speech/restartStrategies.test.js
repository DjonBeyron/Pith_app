import { describe, it, expect } from 'vitest'
import { RESTART_KEY, DEFAULT_STRATEGY, STRATEGY_INFO, readStrategy, writeStrategy, strategyLabel, isStrategyId } from './restartStrategies.js'
import { STRATEGY_IDS, STRATEGIES } from '../../../shared/lib/speech/speechRestart.js'

function memStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
const broken = () => ({ getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } })

describe('выбор стратегии перезапуска (localStorage pithy_admin_voice_restart_v2)', () => {
  it('ключ хранения (v2: умолчание сменено на S6) и подписи для S1…S7 заданы', () => {
    expect(RESTART_KEY).toBe('pithy_admin_voice_restart_v2')
    for (const id of STRATEGY_IDS) expect(STRATEGY_INFO[id].title).toBeTruthy()
    expect(Object.keys(STRATEGY_INFO)).toEqual(Object.keys(STRATEGIES))
    expect(strategyLabel('S3')).toBe('S3 — Новый экземпляр + пауза 900 мс после end')
  })

  it('по умолчанию S6 (аудиосессия play-and-record); мусор в хранилище → умолчание; старый ключ v1 (прежний выбор S1) игнорируется', () => {
    expect(DEFAULT_STRATEGY).toBe('S6')
    expect(readStrategy(memStore({}))).toBe('S6')
    expect(readStrategy(memStore({ [RESTART_KEY]: 'S9' }))).toBe('S6')
    expect(readStrategy(memStore({ pithy_admin_voice_restart_v1: 'S1' }))).toBe('S6')
    expect(strategyLabel('S6')).toBe('S6 — Новый экземпляр + пауза 700 мс + аудиосессия play-and-record')
  })

  it('запись и чтение; незнакомый id не записывается', () => {
    const st = memStore()
    expect(writeStrategy('S4', st)).toBe('S4')
    expect(readStrategy(st)).toBe('S4')
    expect(writeStrategy('zzz', st)).toBe('S6')
    expect(readStrategy(st)).toBe('S4')
    expect(isStrategyId('S2')).toBe(true)
    expect(isStrategyId('M')).toBe(false) // «M» — внутренняя стратегия модуля, в пробе не выбирается
  })

  it('localStorage недоступен: выбор живёт в памяти до перезагрузки, ничего не падает', () => {
    expect(writeStrategy('S5', broken())).toBe('S5')
    expect(readStrategy(broken())).toBe('S5')
    writeStrategy('S6', memStore())
  })
})
