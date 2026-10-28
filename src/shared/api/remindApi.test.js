import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const maybeSingle = vi.fn()
const viewSession = vi.fn()
vi.mock('./supabase.js', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }) }),
  },
}))
vi.mock('./viewSession.js', () => ({ viewSession: () => viewSession() }))

const store = {}
vi.stubGlobal('localStorage', {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: k => { delete store[k] },
})

const { setRemindTime, getRemindTime, REMIND_KEY } = await import('./remindApi.js')

beforeEach(() => {
  rpc.mockReset(); maybeSingle.mockReset(); viewSession.mockReset()
  for (const k of Object.keys(store)) delete store[k]
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('гость', () => {
  beforeEach(() => viewSession.mockResolvedValue(null))

  it('время сохраняется в localStorage, сеть не трогаем', async () => {
    expect(await setRemindTime({ hh: 7, mm: 40, enabled: true })).toEqual({ ok: true, guest: true })
    expect(JSON.parse(store[REMIND_KEY])).toEqual({ hh: 7, mm: 40, enabled: true })
    expect(await getRemindTime()).toEqual({ hh: 7, mm: 40, enabled: true })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('«Не нужно» выключает, но помнит время', async () => {
    await setRemindTime({ hh: 20, mm: 0, enabled: true })
    await setRemindTime({ enabled: false })
    expect(await getRemindTime()).toEqual({ hh: 20, mm: 0, enabled: false })
  })
  it('ничего не выбирал — null; мусорное время отклоняется', async () => {
    expect(await getRemindTime()).toBeNull()
    expect(await setRemindTime({ hh: 25, mm: 0 })).toEqual({ ok: false, reason: 'bad_time' })
    expect(await setRemindTime({ hh: 9, mm: 60 })).toEqual({ ok: false, reason: 'bad_time' })
    expect(await setRemindTime({ enabled: true })).toEqual({ ok: false, reason: 'no_time' })
    expect(store[REMIND_KEY]).toBeUndefined()
  })
})

describe('аккаунт', () => {
  beforeEach(() => viewSession.mockResolvedValue({ user: { id: 'u1' } }))

  it('вызывает RPC с «HH:MM» и возвращает его ответ', async () => {
    rpc.mockResolvedValue({ data: { ok: true, next_remind_at: '2026-10-28T04:40:00Z' }, error: null })
    const r = await setRemindTime({ hh: 7, mm: 40, enabled: true })
    expect(rpc).toHaveBeenCalledWith('set_remind_time', { p_remind_at: '07:40', p_enabled: true })
    expect(r.next_remind_at).toBe('2026-10-28T04:40:00Z')
    expect(store[REMIND_KEY]).toBeUndefined()
  })
  it('выключить без времени: p_remind_at = null', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await setRemindTime({ enabled: false })
    expect(rpc).toHaveBeenCalledWith('set_remind_time', { p_remind_at: null, p_enabled: false })
  })
  it('ошибка RPC — null, без падения', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await setRemindTime({ hh: 9, mm: 0 })).toBeNull()
  })
  it('чтение: time из Postgres «07:40:00» → { hh, mm }', async () => {
    maybeSingle.mockResolvedValue({ data: { remind_at: '07:40:00', remind_enabled: true }, error: null })
    expect(await getRemindTime()).toEqual({ hh: 7, mm: 40, enabled: true })
  })
  it('чтение: время не выбрано или ошибка (миграции нет) — null', async () => {
    maybeSingle.mockResolvedValue({ data: { remind_at: null, remind_enabled: false }, error: null })
    expect(await getRemindTime()).toBeNull()
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'column remind_at does not exist' } })
    expect(await getRemindTime()).toBeNull()
  })
})
