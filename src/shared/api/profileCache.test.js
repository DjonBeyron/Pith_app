import { describe, it, expect, vi, beforeEach } from 'vitest'

const getProfile = vi.fn()
vi.mock('./profileApi.js', () => ({ getProfile: (...a) => getProfile(...a) }))

const { ensureProfile, refreshProfile, refreshOrJoinProfile, clearProfileCache, getCachedProfile } = await import('./profileCache.js')

function deferred() {
  let resolve
  const p = new Promise(res => { resolve = res })
  return { p, resolve }
}

beforeEach(() => {
  getProfile.mockReset()
  clearProfileCache()
})

describe('ensureProfile', () => {
  it('пока кэш пуст, одновременные вызовы делают один запрос', async () => {
    const d = deferred()
    getProfile.mockReturnValue(d.p)
    const a = ensureProfile(); const b = ensureProfile(); const c = ensureProfile()
    expect(getProfile).toHaveBeenCalledTimes(1)
    d.resolve({ xp: 5 })
    expect(await a).toEqual({ xp: 5 })
    expect(await b).toEqual({ xp: 5 })
    expect(await c).toEqual({ xp: 5 })
    expect(getCachedProfile()).toEqual({ xp: 5 })
  })

  it('кэш уже есть — запроса нет', async () => {
    getProfile.mockResolvedValue({ xp: 1 })
    await refreshProfile()
    getProfile.mockClear()
    expect(await ensureProfile()).toEqual({ xp: 1 })
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('после завершения первой загрузки пустой кэш (гость) снова спрашивается', async () => {
    getProfile.mockResolvedValue(null)
    await ensureProfile()
    await ensureProfile()
    expect(getProfile).toHaveBeenCalledTimes(2)
  })
})

describe('refreshProfile / refreshOrJoinProfile', () => {
  it('refreshProfile всегда идёт свежим запросом, даже пока идёт первая загрузка', async () => {
    const d = deferred()
    getProfile.mockReturnValue(d.p)
    ensureProfile()
    refreshProfile()
    expect(getProfile).toHaveBeenCalledTimes(2)
    d.resolve({ xp: 2 })
  })

  it('refreshOrJoinProfile присоединяется к первой загрузке, иначе обновляет', async () => {
    const d = deferred()
    getProfile.mockReturnValue(d.p)
    ensureProfile()
    refreshOrJoinProfile()
    expect(getProfile).toHaveBeenCalledTimes(1)
    d.resolve({ xp: 3 })
    await d.p
    await Promise.resolve(); await Promise.resolve()
    getProfile.mockResolvedValue({ xp: 4 })
    await refreshOrJoinProfile()
    expect(getProfile).toHaveBeenCalledTimes(2)
    expect(getCachedProfile()).toEqual({ xp: 4 })
  })
})
