import { describe, it, expect, vi, beforeEach } from 'vitest'

// Гость не должен ходить в lesson_results: таблица закрыта от anon, ответ 401 даёт ошибку в консоли
// (ловец багов e2e падает). RaceBanner/RacePage/CurriculumView спрашивают «что я прошёл» и у гостя
const from = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('../lib/debug.js', () => ({ dbg: () => {} }))
const session = { value: null }
vi.mock('./viewSession.js', () => ({ viewSession: async () => session.value }))

const { fetchMyCompletedLessonIds } = await import('./raceApi.js')

describe('raceApi: гость', () => {
  beforeEach(() => { from.mockReset(); session.value = null })
  it('fetchMyCompletedLessonIds без сессии — пустой Set и ни одного запроса', async () => {
    expect(await fetchMyCompletedLessonIds(['l1', 'l2'])).toEqual(new Set())
    expect(from).not.toHaveBeenCalled()
  })
  it('с сессией — запрос к lesson_results уходит', async () => {
    session.value = { user: { id: 'u1' } }
    const q = { select: () => q, in: () => q, eq: async () => ({ data: [{ lesson_id: 'l1' }], error: null }) }
    from.mockReturnValue(q)
    expect(await fetchMyCompletedLessonIds(['l1', 'l2'])).toEqual(new Set(['l1']))
    expect(from).toHaveBeenCalledWith('lesson_results')
  })
})
