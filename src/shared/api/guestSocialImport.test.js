import { describe, it, expect, vi, beforeEach } from 'vitest'

// Перенос гостевых лайков/закладок в аккаунт после входа (importGuestSocial)
const upsert = vi.fn()
const from = vi.fn(() => ({ upsert: (...a) => upsert(...a) }))
const viewSession = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { from: (...a) => from(...a) } }))
vi.mock('./viewSession.js', () => ({ viewSession: () => viewSession() }))

const store = {}
vi.stubGlobal('localStorage', {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: k => { delete store[k] },
})

const { importGuestSocial } = await import('./moduleSocialApi.js')
const { toggleGuestLike, toggleGuestSave, getGuestLikes, getGuestSaves, clearGuestSocial } =
  await import('../lib/guestSocial.js')

beforeEach(() => {
  upsert.mockReset(); from.mockClear(); viewSession.mockReset()
  upsert.mockResolvedValue({ error: null })
  clearGuestSocial()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('importGuestSocial', () => {
  it('нечего переносить — в сеть не ходит', async () => {
    viewSession.mockResolvedValue({ user: { id: 'u1' } })
    expect(await importGuestSocial()).toBe(false)
    expect(from).not.toHaveBeenCalled()
  })

  it('без входа ничего не трогает: лайки остаются у гостя', async () => {
    viewSession.mockResolvedValue(null)
    toggleGuestLike('m1')
    expect(await importGuestSocial()).toBe(false)
    expect(getGuestLikes()).toEqual(['m1'])
  })

  it('после входа: пачкой в module_likes / module_bookmarks без дублей, списки чистятся', async () => {
    viewSession.mockResolvedValue({ user: { id: 'u1' } })
    toggleGuestLike('m1'); toggleGuestLike('m2'); toggleGuestSave('m3')
    expect(await importGuestSocial()).toBe(true)
    expect(from).toHaveBeenCalledWith('module_likes')
    expect(from).toHaveBeenCalledWith('module_bookmarks')
    const [likeRows, opts] = upsert.mock.calls[0]
    expect(likeRows).toEqual([{ user_id: 'u1', module_id: 'm1' }, { user_id: 'u1', module_id: 'm2' }])
    expect(opts).toEqual({ onConflict: 'user_id,module_id', ignoreDuplicates: true })
    expect(upsert.mock.calls[1][0]).toEqual([{ user_id: 'u1', module_id: 'm3' }])
    expect(getGuestLikes()).toEqual([])
    expect(getGuestSaves()).toEqual([])
  })

  it('битая строка роняет пачку — остальные вставляются по одной, перенос засчитан', async () => {
    viewSession.mockResolvedValue({ user: { id: 'u1' } })
    toggleGuestLike('gone'); toggleGuestLike('ok')
    upsert.mockImplementation(async rows =>
      (Array.isArray(rows) || rows.module_id === 'gone' ? { error: { message: 'fk' } } : { error: null }))
    expect(await importGuestSocial()).toBe(true)
    expect(getGuestLikes()).toEqual([])
  })

  it('сервер отверг всё (нет сети) — гостевые лайки не теряем', async () => {
    viewSession.mockResolvedValue({ user: { id: 'u1' } })
    toggleGuestLike('m1')
    upsert.mockResolvedValue({ error: { message: 'network' } })
    expect(await importGuestSocial()).toBe(false)
    expect(getGuestLikes()).toEqual(['m1'])
  })
})
