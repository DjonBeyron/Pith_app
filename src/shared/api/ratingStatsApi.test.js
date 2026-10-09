import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))
vi.mock('../lib/debug.js', () => ({ dbg: () => {} }))

const { fetchUserStats, peekUserStats, clearUserStatsCache } = await import('./ratingStatsApi.js')

const okData = { ok: true, words_new: 1, words_known: 2, words_solid: 3, words_perm: 4, phrases: 5, longest_streak: 6 }
const okWithAch = { ...okData, achievements: 2 }

beforeEach(() => { rpc.mockReset(); clearUserStatsCache(); vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('fetchUserStats', () => {
  it('успех: нормализованные счётчики, второй вызов — из кэша', async () => {
    rpc.mockResolvedValue({ data: okData, error: null })
    const a = await fetchUserStats('u1')
    expect(a.state).toBe('ok')
    expect(a.stats.perm).toBe(4)
    expect(a.stats.achievements).toBeNull() // в okData нет achievements — старая версия сервера
    expect(peekUserStats('u1')).toBe(a)
    await fetchUserStats('u1')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('leaderboard_user_stats', { p_user: 'u1' })
  })
  it('новая версия сервера: достижения приходят в stats', async () => {
    rpc.mockResolvedValue({ data: okWithAch, error: null })
    const a = await fetchUserStats('u9')
    expect(a.stats.achievements).toBe(2)
  })
  it('force обходит кэш', async () => {
    rpc.mockResolvedValue({ data: okData, error: null })
    await fetchUserStats('u1')
    await fetchUserStats('u1', { force: true })
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('параллельные запросы схлопываются в один', async () => {
    rpc.mockResolvedValue({ data: okData, error: null })
    await Promise.all([fetchUserStats('u2'), fetchUserStats('u2')])
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('функции нет → missing (не кэшируется как успех)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    expect((await fetchUserStats('u3')).state).toBe('missing')
    expect(peekUserStats('u3')).toBeNull()
  })
  it('нет прав → denied; сбой сети → error; исключение → error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } })
    expect((await fetchUserStats('a')).state).toBe('denied')
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    expect((await fetchUserStats('b')).state).toBe('error')
    rpc.mockRejectedValueOnce(new Error('network'))
    expect((await fetchUserStats('c')).state).toBe('error')
  })
  it('игрок не найден (ok:false) → missing; без id — без запроса', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'not_found' }, error: null })
    expect((await fetchUserStats('zz')).state).toBe('missing')
    rpc.mockClear()
    expect((await fetchUserStats('')).state).toBe('missing')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('после ошибки повтор снова ходит в сеть', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect((await fetchUserStats('r')).state).toBe('error')
    rpc.mockResolvedValueOnce({ data: okData, error: null })
    expect((await fetchUserStats('r', { force: true })).state).toBe('ok')
  })
})
