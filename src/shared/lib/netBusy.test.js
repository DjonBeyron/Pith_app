import { describe, it, expect, vi, beforeEach } from 'vitest'
import { begin, isBusy, busyCount, setFeedActive, isFeedActive, subscribe, isVideoActive } from './netBusy.js'

beforeEach(() => { setFeedActive(false) })

describe('netBusy: счётчик загрузок', () => {
  it('begin/end считают нескольких владельцев; повторный end ничего не ломает', () => {
    expect(isBusy()).toBe(false)
    const a = begin(), b = begin()
    expect(busyCount()).toBe(2)
    a(); a()
    expect(busyCount()).toBe(1)
    expect(isBusy()).toBe(true)
    b()
    expect(isBusy()).toBe(false)
  })
  it('подписчики узнают о begin, end и смене флага ленты; отписка работает; сбойный подписчик не мешает', () => {
    const fn = vi.fn()
    const off = subscribe(fn)
    subscribe(() => { throw new Error('boom') })
    const end = begin(); end()
    setFeedActive(true); setFeedActive(true) // второй вызов без изменений — тишина
    expect(fn).toHaveBeenCalledTimes(3)
    off()
    setFeedActive(false)
    expect(fn).toHaveBeenCalledTimes(3)
  })
  it('флаг ленты', () => {
    expect(isFeedActive()).toBe(false)
    setFeedActive(true)
    expect(isFeedActive()).toBe(true)
  })
})

describe('netBusy: видео в документе', () => {
  const doc = list => ({ querySelectorAll: () => list })
  it('играющее — занято; на паузе и догруженное — свободно; грузящееся без запаса — занято', () => {
    expect(isVideoActive(doc([]))).toBe(false)
    expect(isVideoActive(doc([{ paused: false, ended: false, networkState: 1, readyState: 4 }]))).toBe(true)
    expect(isVideoActive(doc([{ paused: true, ended: false, networkState: 1, readyState: 4 }]))).toBe(false)
    expect(isVideoActive(doc([{ paused: true, ended: true, networkState: 1, readyState: 4 }]))).toBe(false)
    expect(isVideoActive(doc([{ paused: true, ended: false, networkState: 2, readyState: 1 }]))).toBe(true)
    expect(isVideoActive(doc([{ paused: true, ended: false, networkState: 2, readyState: 4 }]))).toBe(false)
  })
  it('нет DOM — не падаем', () => {
    expect(isVideoActive(undefined)).toBe(false)
    expect(isVideoActive({ querySelectorAll() { throw new Error('x') } })).toBe(false)
  })
})
