import { describe, it, expect } from 'vitest'
import { tapRound, optionState } from './useOptionRound.js'
import { gameVerdict } from './gameVerdict.js'

const cfg = { count: 3, correctAt: 1 }
const fresh = () => ({ wrong: new Set(), solved: null })

describe('раунд «выбери из вариантов»', () => {
  it('неверный гаснет, раунд идёт дальше', () => {
    const { state, finished } = tapRound(fresh(), 0, cfg)
    expect(finished).toBe(false)
    expect([...state.wrong]).toEqual([0])
    expect(state.solved).toBeNull()
    expect(optionState(state, 0)).toBe('wrong')
    expect(optionState(state, 2)).toBe('idle')
  })

  it('верный закрывает раунд, остальные тускнеют; повторные касания ничего не меняют', () => {
    const a = tapRound(fresh(), 0, cfg).state
    const b = tapRound(a, 1, cfg)
    expect(b.finished).toBe(true)
    expect(b.state.solved).toBe(1)
    expect(b.state.wrong.size).toBe(1) // итог: один промах
    expect(optionState(b.state, 1)).toBe('ok')
    expect(optionState(b.state, 2)).toBe('dim')
    const again = tapRound(b.state, 2, cfg)
    expect(again.state).toBe(b.state)
    expect(again.finished).toBe(false)
  })

  it('повторное касание погасшего и касание мимо списка — без изменений', () => {
    const a = tapRound(fresh(), 2, cfg).state
    expect(tapRound(a, 2, cfg).state).toBe(a)
    expect(tapRound(a, 7, cfg).state).toBe(a)
    expect(tapRound(a, -1, cfg).state).toBe(a)
    expect(tapRound(a, NaN, cfg).state).toBe(a)
  })

  it('с первого раза верно: промахов нет', () => {
    const r = tapRound(fresh(), 1, cfg)
    expect(r.finished).toBe(true)
    expect(r.state.wrong.size).toBe(0)
  })
})

describe('gameVerdict', () => {
  it('нет ответа — нет подписи; верно с первого раза; с промахами — верное слово без красного и цифр', () => {
    expect(gameVerdict(null, 'keep')).toBeNull()
    expect(gameVerdict({ ok: true }, 'keep')).toEqual({ kind: 'ok', text: 'Верно!' })
    expect(gameVerdict({ ok: false }, 'keep')).toEqual({ kind: 'bad', text: 'Получилось — верно: keep' })
    expect(gameVerdict({ ok: false }, '').text).toMatch(/ничего страшного/)
  })
})
