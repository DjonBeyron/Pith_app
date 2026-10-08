import { describe, it, expect, beforeEach } from 'vitest'
import { CONFIRM_TIMES, shouldConfirm, noteConfirmShown, confirmCopy } from './catchConfirm.js'

// localStorage в node-окружении vitest нет — подставляем
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

describe('правило трёх', () => {
  it('сначала показываем', () => {
    expect(shouldConfirm('reveal')).toBe(true)
    expect(shouldConfirm('hint')).toBe(true)
  })
  it('после трёх показов — больше нет', () => {
    for (let i = 0; i < CONFIRM_TIMES - 1; i++) noteConfirmShown('reveal')
    expect(shouldConfirm('reveal')).toBe(true)
    noteConfirmShown('reveal')
    expect(shouldConfirm('reveal')).toBe(false)
  })
  it('счётчики reveal и hint независимы', () => {
    for (let i = 0; i < CONFIRM_TIMES; i++) noteConfirmShown('reveal')
    expect(shouldConfirm('reveal')).toBe(false)
    expect(shouldConfirm('hint')).toBe(true)
    noteConfirmShown('hint')
    expect(JSON.parse(localStorage.getItem('pithy_catch_confirm_v1'))).toEqual({ reveal: 3, hint: 1 })
  })
  it('localStorage недоступен или битый — показываем, не падаем', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(shouldConfirm('hint')).toBe(true)
    expect(() => noteConfirmShown('hint')).not.toThrow()
    globalThis.localStorage = { getItem: () => '{oops', setItem: () => {} }
    expect(shouldConfirm('reveal')).toBe(true)
  })
})

describe('confirmCopy', () => {
  it('reveal — не зависит от memory', () => {
    const a = confirmCopy('reveal', false)
    expect(a).toEqual(confirmCopy('reveal', true))
    expect(a.title).toBe('Раскрыть фразу?')
    expect(a.ok).toBe('Раскрыть')
    expect(a.cancel).toBe('Ещё попробую')
  })
  it('hint: memory=true предупреждает про завтра', () => {
    const c = confirmCopy('hint', true)
    expect(c.title).toBe('Подсказать?')
    expect(c.text).toContain('напомним его завтра')
    expect([c.ok, c.cancel]).toEqual(['Подсказать', 'Попробую сам'])
  })
  it('hint: memory=false — на память не повлияет', () => {
    const c = confirmCopy('hint', false)
    expect(c.text).toContain('На память это не повлияет')
    expect(c.text).not.toContain('завтра')
  })
  it('нигде нет слова «ошибка»', () => {
    for (const [k, m] of [['reveal', false], ['hint', true], ['hint', false]]) {
      expect(JSON.stringify(confirmCopy(k, m)).toLowerCase()).not.toContain('ошибк')
    }
  })
})
