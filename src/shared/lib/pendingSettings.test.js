import { describe, it, expect, beforeEach } from 'vitest'
import { setPending, getPending, clearPending, hasPending, pendingLabels, flushPending, flushOne, subscribePending } from './pendingSettings.js'

beforeEach(() => { ['a', 'b'].forEach(clearPending) })

describe('несохранённые глобальные настройки', () => {
  it('правка попадает в реестр, подписчики узнают, значение читается обратно, очистка снимает', () => {
    let n = 0
    const off = subscribePending(() => n++)
    expect(hasPending()).toBe(false)
    setPending('a', { value: { x: 1 }, flush: async () => {}, label: 'реплики' })
    expect(hasPending()).toBe(true)
    expect(getPending('a').value).toEqual({ x: 1 })
    expect(pendingLabels()).toEqual(['реплики'])
    clearPending('a')
    expect(hasPending()).toBe(false)
    expect(n).toBe(2)
    off()
  })
  it('flushPending записывает все и снимает их; упавшая остаётся и попадает в текст ошибки', async () => {
    const done = []
    setPending('a', { value: 1, flush: async () => { done.push('a') }, label: 'A' })
    setPending('b', { value: 2, flush: async () => { throw new Error('нет прав') }, label: 'B' })
    await expect(flushPending()).rejects.toThrow('B: нет прав')
    expect(done).toEqual(['a'])
    expect(getPending('a')).toBeNull()
    expect(getPending('b')).not.toBeNull()
  })
  it('новая правка, пришедшая во время записи, не теряется', async () => {
    setPending('a', { value: 1, flush: async () => { setPending('a', { value: 2, flush: async () => {}, label: 'A' }) }, label: 'A' })
    await flushOne('a')
    expect(getPending('a').value).toBe(2)
  })
})
