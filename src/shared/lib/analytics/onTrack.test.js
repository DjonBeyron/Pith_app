import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// onTrack(): подписка на события журнала (для оценки уровня)
vi.mock('../debug.js', () => ({ dbg: vi.fn() }))
vi.mock('../../api/supabase.js', () => ({ supabase: { auth: { getSession: async () => ({ data: {} }), onAuthStateChange: () => {} } } }))

describe('onTrack — слушатели событий журнала', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('слушатель получает имя и props, отписка работает', async () => {
    const { track, onTrack } = await import('./track.js')
    const fn = vi.fn()
    const off = onTrack(fn)
    track('feed_slow', { module_id: 'm1', on: true })
    expect(fn).toHaveBeenCalledWith('feed_slow', { module_id: 'm1', on: true })
    off()
    track('feed_slow', { module_id: 'm1', on: false })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('ошибка слушателя глотается: остальные слушатели и журнал работают', async () => {
    const { track, onTrack } = await import('./track.js')
    const bad = vi.fn(() => { throw new Error('сломан') })
    const good = vi.fn()
    const offs = [onTrack(bad), onTrack(good)]
    expect(() => track('feed_reveal', { module_id: 'm2' })).not.toThrow()
    expect(good).toHaveBeenCalledWith('feed_reveal', { module_id: 'm2' })
    offs.forEach(off => off())
  })

  it('события песочницы слушателям не доходят', async () => {
    const { track, onTrack } = await import('./track.js')
    const fn = vi.fn()
    const off = onTrack(fn)
    track('feed_reveal', { module_id: '__sandbox__' })
    expect(fn).not.toHaveBeenCalled()
    off()
  })
})
