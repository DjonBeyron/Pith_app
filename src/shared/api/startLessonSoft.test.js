import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { rpc: (...a) => rpc(...a), auth: { getSession: async () => ({ data: { session: null } }) } } }))
vi.mock('./viewSession.js', () => ({ viewSession: async () => null }))

const { startLessonSoft } = await import('./profileApi.js')

// Ответ start_lesson не должен держать урок после полной полосы загрузки: ждём не дольше waitMs, поздний ответ приходит в onLate
describe('startLessonSoft', () => {
  beforeEach(() => { rpc.mockReset(); vi.useFakeTimers() })

  it('быстрый ответ — возвращается как есть', async () => {
    rpc.mockResolvedValue({ data: { ok: false, next_at: 'x' }, error: null })
    const onLate = vi.fn()
    expect(await startLessonSoft('l1', { onLate })).toEqual({ ok: false, next_at: 'x' })
    expect(onLate).not.toHaveBeenCalled()
  })

  it('медленный ответ — урок открывается (ok), решение сервера приходит позже в onLate', async () => {
    let answer
    rpc.mockReturnValue(new Promise(r => { answer = r }))
    const onLate = vi.fn()
    const p = startLessonSoft('l1', { waitMs: 1200, onLate })
    await vi.advanceTimersByTimeAsync(1300)
    expect(await p).toEqual({ ok: true, late: true })
    expect(onLate).not.toHaveBeenCalled()
    answer({ data: { ok: false, next_at: 'z' }, error: null })
    await vi.advanceTimersByTimeAsync(0)
    expect(onLate).toHaveBeenCalledWith({ ok: false, next_at: 'z' })
  })
})
