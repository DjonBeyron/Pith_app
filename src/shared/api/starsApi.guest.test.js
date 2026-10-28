import { describe, it, expect, vi, beforeEach } from 'vitest'

// Гость не должен ходить в lesson_results: RLS отвечает 401 «permission denied», в консоль летит ошибка,
// а ловец багов e2e падает. Без сессии обе функции возвращают пусто, не трогая клиент
const from = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('../lib/newbieSim.js', () => ({ isNewbieSim: () => false }))
const session = { value: null }
vi.mock('./viewSession.js', () => ({ viewSession: async () => session.value }))

const { fetchMyDoneLessonIds, fetchMyLessonStars } = await import('./starsApi.js')

describe('starsApi: гость', () => {
  beforeEach(() => { from.mockReset(); session.value = null })
  it('fetchMyDoneLessonIds без сессии — пустой Set и ни одного запроса', async () => {
    expect(await fetchMyDoneLessonIds()).toEqual(new Set())
    expect(from).not.toHaveBeenCalled()
  })
  it('fetchMyLessonStars без сессии — пустая Map и ни одного запроса', async () => {
    expect(await fetchMyLessonStars(['l1'])).toEqual(new Map())
    expect(from).not.toHaveBeenCalled()
  })
  it('с сессией — запрос уходит', async () => {
    session.value = { user: { id: 'u1' } }
    const q = { select: () => q, eq: async () => ({ data: [{ lesson_id: 'l1' }], error: null }) }
    from.mockReturnValue(q)
    expect(await fetchMyDoneLessonIds()).toEqual(new Set(['l1']))
    expect(from).toHaveBeenCalledWith('lesson_results')
  })
})
