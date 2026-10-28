import { describe, it, expect, vi, beforeEach } from 'vitest'

// Гость: RPC leaderboard_user_stats закрыта от anon — вместо запроса (401 и ошибка в консоли) сразу «нет прав»
const rpc = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))
vi.mock('../lib/debug.js', () => ({ dbg: () => {} }))
const session = { value: null }
vi.mock('./viewSession.js', () => ({ viewSession: async () => session.value }))

const { fetchUserStats, peekUserStats, clearUserStatsCache } = await import('./ratingStatsApi.js')

describe('ratingStatsApi: гость', () => {
  beforeEach(() => { rpc.mockReset(); clearUserStatsCache(); session.value = null })
  it('без сессии — denied и ни одного запроса, в кэш не кладётся', async () => {
    expect(await fetchUserStats('u1')).toEqual({ state: 'denied', stats: null })
    expect(rpc).not.toHaveBeenCalled()
    expect(peekUserStats('u1')).toBeNull()
  })
  it('с сессией — запрос уходит', async () => {
    session.value = { user: { id: 'me' } }
    rpc.mockResolvedValue({ data: { ok: true, words_new: 1, words_known: 2, words_solid: 3, words_perm: 4, phrases: 5, longest_streak: 6 }, error: null })
    expect((await fetchUserStats('u1')).state).toBe('ok')
    expect(rpc).toHaveBeenCalledWith('leaderboard_user_stats', { p_user: 'u1' })
  })
})
