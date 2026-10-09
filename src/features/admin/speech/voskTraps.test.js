import { describe, it, expect } from 'vitest'
import { classifyTrap, cleanTrapWord, trapCount, trapSpec, silenceSpec, TRAP_ALLOWED, TRAP_GRAMMAR, TRAP_PRESETS, SILENCE_MS } from './voskTraps.js'

describe('ловушки', () => {
  it('словарь ловушек — тот же, что в «Тесте закрытого словаря»', () => {
    expect(TRAP_GRAMMAR).toBe('["try","trying","[unk]"]')
    expect(TRAP_ALLOWED).toEqual(['try', 'trying'])
    expect(TRAP_PRESETS).toEqual(['tried', 'tries', 'trine', 'hello', 'train', 'treat'])
  })
  it('[unk] и пусто — отвергнуто; try/trying — ложное принятие', () => {
    expect(classifyTrap('[unk]')).toEqual({ out: 'rejected', sw: null })
    expect(classifyTrap('[unk] [unk]').out).toBe('rejected')
    expect(classifyTrap('')).toEqual({ out: 'empty', sw: null })
    expect(classifyTrap('try')).toEqual({ out: 'accepted', sw: 'try' })
    expect(classifyTrap('[unk] trying')).toEqual({ out: 'accepted', sw: 'trying' })
    expect(classifyTrap('hello').out).toBe('other')
  })
  it('своё слово: латиница, не из словаря', () => {
    expect(cleanTrapWord(' Hello ')).toBe('hello')
    expect(cleanTrapWord('try')).toBeNull()
    expect(cleanTrapWord('trying')).toBeNull()
    expect(cleanTrapWord('привет')).toBeNull()
    expect(cleanTrapWord('a')).toBeNull()
  })
  it('счётчик «ложных принятий N из M», тишина отдельно', () => {
    const runs = [
      { kind: 'trap', out: 'rejected' }, { kind: 'trap', out: 'accepted' }, { kind: 'trap', out: 'empty' },
      { kind: 'silence', out: 'empty' }, { kind: 'silence', out: 'accepted' }, { kind: 'ctx', out: 'asis' },
    ]
    expect(trapCount(runs)).toEqual({ n: 5, bad: 2, silence: 2, silenceBad: 1 })
    expect(trapCount([])).toEqual({ n: 0, bad: 0, silence: 0, silenceBad: 0 })
  })
  it('спецификации: слово-ловушка и тишина 3 с (потолок записи)', () => {
    expect(trapSpec('tried')).toMatchObject({ kind: 'trap', said: 'tried', grammar: TRAP_GRAMMAR })
    expect(silenceSpec()).toMatchObject({ kind: 'silence', maxMs: SILENCE_MS, said: '' })
    expect(SILENCE_MS).toBe(3000)
  })
})
