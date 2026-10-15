import { describe, it, expect } from 'vitest'
import * as H from './draftHistory.js'

// История черновика: стек, отмена/повтор, лимит 50, склейка ввода, подписи шагов

const step = (n, over = {}) => ({ before: { scene: { n } }, label: `шаг ${n}`, key: null, at: n * 10_000, ...over })
const push = (h, ...steps) => steps.reduce((acc, s) => H.pushStep(acc, s), h)
const cur = n => ({ scene: { n }, saved: { id: 'x' } })

describe('draftHistory — стек', () => {
  it('пустая история: отменять и повторять нечего', () => {
    const h = H.emptyHistory()
    expect(H.canUndo(h)).toBe(false)
    expect(H.canRedo(h)).toBe(false)
    expect(H.undo(h, cur(0))).toBeNull()
    expect(H.redo(h, cur(0))).toBeNull()
    expect(H.undoLabel(h)).toBeNull()
  })

  it('push → undo возвращает сцену ДО шага и подпись; redo — обратно', () => {
    const h = push(H.emptyHistory(), step(1), step(2))
    expect(H.undoLabel(h)).toBe('шаг 2')
    const u = H.undo(h, cur(3))
    expect(u.state.scene).toEqual({ n: 2 })
    expect(u.label).toBe('шаг 2')
    expect(H.undoLabel(u.history)).toBe('шаг 1')
    expect(H.redoLabel(u.history)).toBe('шаг 2')
    const r = H.redo(u.history, { scene: { n: 2 } })
    expect(r.state.scene).toEqual({ n: 3 })
    expect(H.canRedo(r.history)).toBe(false)
    expect(H.undoLabel(r.history)).toBe('шаг 2')
  })

  it('новая правка после отмены очищает «повтор»', () => {
    const u = H.undo(push(H.emptyHistory(), step(1), step(2)), cur(3))
    expect(H.canRedo(u.history)).toBe(true)
    expect(H.canRedo(H.pushStep(u.history, step(9)))).toBe(false)
  })

  it('лимит 50 шагов: самые старые отбрасываются', () => {
    let h = H.emptyHistory()
    for (let i = 1; i <= 60; i++) h = H.pushStep(h, step(i))
    expect(h.past).toHaveLength(H.HISTORY_LIMIT)
    expect(h.past[0].label).toBe('шаг 11')
    expect(H.undoLabel(h)).toBe('шаг 60')
  })

  it('шаг с привязкой к библиотеке (saved) возвращает и её; обычный — нет', () => {
    const withSaved = { before: { scene: { n: 1 }, saved: { id: 'old' } }, label: 'загрузка сцены', key: null, at: 0 }
    const u = H.undo(H.pushStep(H.emptyHistory(), withSaved), cur(2))
    expect(u.state.saved).toEqual({ id: 'old' })
    expect(H.redo(u.history, { scene: { n: 1 }, saved: { id: 'old' } }).state.saved).toEqual({ id: 'x' })
    expect(H.undo(H.pushStep(H.emptyHistory(), step(1)), cur(2)).state.saved).toBeUndefined()
  })
})

describe('draftHistory — склейка ввода', () => {
  const typing = (n, at) => step(n, { key: 'line0:text', label: 'ввод текста реплики 1', at })

  it('ввод в одно поле с паузами до 600 мс — один шаг, откат к самому первому состоянию', () => {
    let h = H.emptyHistory()
    h = H.pushStep(h, typing(1, 1000))
    h = H.pushStep(h, typing(2, 1200))
    h = H.pushStep(h, typing(3, 1790))
    expect(h.past).toHaveLength(1)
    expect(H.undo(h, cur(4)).state.scene).toEqual({ n: 1 })
  })

  it('пауза больше 600 мс — новый шаг', () => {
    let h = H.pushStep(H.emptyHistory(), typing(1, 1000))
    h = H.pushStep(h, typing(2, 1000 + H.COALESCE_MS + 1))
    expect(h.past).toHaveLength(2)
  })

  it('другое поле или шаг без ключа не склеиваются', () => {
    let h = H.pushStep(H.emptyHistory(), typing(1, 1000))
    h = H.pushStep(h, step(2, { key: 'line1:text', at: 1100 }))
    h = H.pushStep(h, step(3, { at: 1200 }))
    h = H.pushStep(h, step(4, { at: 1300 }))
    expect(h.past).toHaveLength(4)
  })

  it('после отмены ввод не приклеивается к старому шагу', () => {
    let h = H.pushStep(H.emptyHistory(), typing(1, 1000))
    h = H.pushStep(h, step(2, { at: 1100 }))
    h = H.undo(h, cur(3)).history
    h = H.pushStep(h, typing(5, 1150))
    expect(h.past).toHaveLength(2)
  })
})
