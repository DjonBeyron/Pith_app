import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSoftRemover, SOFT_DELETE_MS } from './softRemover.js'

// Мягкое удаление сцены из библиотеки: 8 секунд на «Отменить», потом настоящее удаление

let commit, views, r
beforeEach(() => {
  vi.useFakeTimers()
  commit = vi.fn(() => Promise.resolve(true))
  views = []
  r = createSoftRemover({ commit, onChange: v => views.push(v) })
})
afterEach(() => vi.useRealTimers())
const last = () => views[views.length - 1]

describe('мягкое удаление', () => {
  it('строка прячется сразу, в базе не удаляется до таймера', () => {
    r.schedule({ id: 'a', title: 'Кофе' })
    expect(last()).toEqual({ hidden: ['a'], pending: { id: 'a', title: 'Кофе' } })
    vi.advanceTimersByTime(SOFT_DELETE_MS - 1)
    expect(commit).not.toHaveBeenCalled()
  })
  it('по таймеру удаляется; строка остаётся скрытой, пока commit не завершился', async () => {
    const onDone = vi.fn()
    r.schedule({ id: 'a', title: 'Кофе' }, onDone)
    vi.advanceTimersByTime(SOFT_DELETE_MS)
    expect(commit).toHaveBeenCalledWith('a')
    expect(onDone).toHaveBeenCalledOnce()
    expect(last().pending).toBeNull()
    expect(last().hidden).toEqual(['a'])
    await vi.runAllTimersAsync()
    expect(last().hidden).toEqual([])
  })
  it('«Отменить» возвращает строку и удаление не происходит', () => {
    r.schedule({ id: 'a', title: 'Кофе' })
    vi.advanceTimersByTime(3000)
    expect(r.cancel()).toEqual({ id: 'a', title: 'Кофе' })
    expect(last()).toEqual({ hidden: [], pending: null })
    vi.advanceTimersByTime(SOFT_DELETE_MS * 2)
    expect(commit).not.toHaveBeenCalled()
    expect(r.cancel()).toBeNull()
  })
  it('второе удаление сразу выполняет первое; отменить можно только последнее', () => {
    r.schedule({ id: 'a', title: 'A' })
    r.schedule({ id: 'b', title: 'B' })
    expect(commit).toHaveBeenCalledWith('a')
    expect(r.cancel()).toEqual({ id: 'b', title: 'B' })
  })
  it('flush (закрытие окна) выполняет отложенное удаление сразу', () => {
    r.schedule({ id: 'a', title: 'A' })
    r.flush()
    expect(commit).toHaveBeenCalledWith('a')
    vi.advanceTimersByTime(SOFT_DELETE_MS)
    expect(commit).toHaveBeenCalledTimes(1)
  })
})
