import { describe, it, expect } from 'vitest'
import { SAY_DONE, SAY_WRONG, SAY_WRONG_LEGACY, SAY_CANT, wrongTrigger, findWrongOut, setSayExit } from './sayTriggers.js'

const ids = () => { let n = 0; return () => `new${++n}` }

describe('имена выходов «Сказать фразу» (sayTriggers.js)', () => {
  it('два выхода: say_done («верный») и say_wrong («неверный»); say_skip — старое имя второго; say_cant — итог панели, не триггер', () => {
    expect([SAY_DONE, SAY_WRONG, SAY_WRONG_LEGACY, SAY_CANT]).toEqual(['say_done', 'say_wrong', 'say_skip', 'say_cant'])
  })

  it('wrongTrigger: только подключённые; say_wrong приоритетнее say_skip; нет ничего — null', () => {
    expect(wrongTrigger([{ if: 'say_done', then: 'a' }])).toBe(null)
    expect(wrongTrigger(undefined)).toBe(null)
    expect(wrongTrigger([{ if: 'say_wrong', then: null }, { if: 'say_skip', then: 'b' }]).then).toBe('b')
    expect(wrongTrigger([{ if: 'say_skip', then: 'b' }, { if: 'say_wrong', then: 'c' }]).then).toBe('c')
  })

  it('findWrongOut для редактора: подключённый выигрывает, иначе say_wrong / say_skip / второй по порядку', () => {
    expect(findWrongOut([{ if: 'say_done', then: 'a' }, { if: 'say_skip', then: 'b' }]).if).toBe('say_skip')
    expect(findWrongOut([{ if: 'say_done', then: 'a' }, { if: 'say_wrong', then: null }, { if: 'say_skip', then: 'b' }]).then).toBe('b')
    expect(findWrongOut([{ if: 'say_done', then: 'a' }, { if: 'say_wrong', then: null }]).if).toBe('say_wrong')
    expect(findWrongOut([{ id: 'x', if: 'q', then: null }, { id: 'y', if: 'z', then: 'k' }]).id).toBe('y')
    expect(findWrongOut([])).toBeUndefined()
  })
})

describe('setSayExit — запись связи в редакторе схем', () => {
  it('новая нода: оба выхода создаются парой say_done / say_wrong', () => {
    const out = setSayExit([], 'say_done', 'n2', ids())
    expect(out).toEqual([{ id: 'new1', if: 'say_done', then: 'n2' }, { id: 'new2', if: 'say_wrong', then: null }])
  })

  it('связь второго выхода: id сохраняются, первый не трогается; пустое значение снимает связь', () => {
    const cur = [{ id: 'a', if: 'say_done', then: 'n2' }, { id: 'b', if: 'say_wrong', then: null }]
    expect(setSayExit(cur, 'say_wrong', 'n3')).toEqual([{ id: 'a', if: 'say_done', then: 'n2' }, { id: 'b', if: 'say_wrong', then: 'n3' }])
    expect(setSayExit(setSayExit(cur, 'say_wrong', 'n3'), 'say_wrong', '')).toEqual([{ id: 'a', if: 'say_done', then: 'n2' }, { id: 'b', if: 'say_wrong', then: null }])
  })

  it('миграция старой схемы: say_skip переименовывается в say_wrong при первой правке, связь и id не теряются', () => {
    const old = [{ id: 'a', if: 'say_done', then: 'n2' }, { id: 'b', if: 'say_skip', then: 'n9' }]
    expect(setSayExit(old, 'say_done', 'n5')).toEqual([{ id: 'a', if: 'say_done', then: 'n5' }, { id: 'b', if: 'say_wrong', then: 'n9' }])
    expect(setSayExit(old, 'say_wrong', 'n7')).toEqual([{ id: 'a', if: 'say_done', then: 'n2' }, { id: 'b', if: 'say_wrong', then: 'n7' }])
  })

  it('урок с одним выходом say_done: второй выход добавляется пустым, существующая связь остаётся', () => {
    const one = [{ id: 'a', if: 'say_done', then: 'n2' }]
    expect(setSayExit(one, 'say_wrong', 'n3', ids())).toEqual([{ id: 'a', if: 'say_done', then: 'n2' }, { id: 'new1', if: 'say_wrong', then: 'n3' }])
    expect(setSayExit(one, 'say_done', 'n4', ids())).toEqual([{ id: 'a', if: 'say_done', then: 'n4' }, { id: 'new1', if: 'say_wrong', then: null }])
  })
})
