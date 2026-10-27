import { describe, it, expect, vi, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}

const rpc = vi.fn()
const single = vi.fn()
const session = { user: { id: 'u1' } }
let current = null
vi.mock('./supabase.js', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ single: () => single() }) }) }),
  },
}))
vi.mock('./viewSession.js', () => ({ viewSession: async () => current }))
vi.mock('../lib/debug.js', () => ({ dbg: () => {} }))

const { loadLevelProfile, saveLevelProfile } = await import('./levelApi.js')
const { loadLevel } = await import('../lib/level/levelStore.js')
const { emptyLevel } = await import('../lib/level/levelModel.js')

const lv = { ear: { level: 0.7, sigma: 0.2, n: 3 }, vocab: { level: 0.3, sigma: 0.1, n: 2 }, updatedAt: 9 }

beforeEach(() => {
  rpc.mockReset(); single.mockReset(); localStorage.clear(); current = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('levelApi', () => {
  it('гость: сохраняет и читает локально, сервер не трогает', async () => {
    expect(await saveLevelProfile(lv)).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
    expect(await loadLevelProfile()).toEqual(lv)
  })

  it('вошедший: сохранение — RPC set_level_profile', async () => {
    current = session
    rpc.mockResolvedValue({ error: null })
    expect(await saveLevelProfile(lv)).toBe(true)
    expect(rpc).toHaveBeenCalledWith('set_level_profile', { p_ear: 0.7, p_ear_sigma: 0.2, p_vocab: 0.3, p_vocab_sigma: 0.1 })
  })

  it('вошедший: ошибка RPC → false, копия остаётся локально', async () => {
    current = session
    rpc.mockResolvedValue({ error: { message: 'нет функции' } })
    expect(await saveLevelProfile(lv)).toBe(false)
    expect(loadLevel()).toEqual(lv)
  })

  it('вошедший: чтение из user_profiles', async () => {
    current = session
    single.mockResolvedValue({ data: { ear_level: 0.8, ear_sigma: 0.15, vocab_level: 0.4, vocab_sigma: 0.2 }, error: null })
    const out = await loadLevelProfile()
    expect(out.ear.level).toBeCloseTo(0.8)
    expect(out.vocab.sigma).toBeCloseTo(0.2)
  })

  it('вошедший: поля ещё пустые → emptyLevel; ошибка (нет миграции) → локальный', async () => {
    current = session
    single.mockResolvedValue({ data: { ear_level: null, ear_sigma: null, vocab_level: null, vocab_sigma: null }, error: null })
    expect(await loadLevelProfile()).toEqual(emptyLevel())
    single.mockResolvedValue({ data: null, error: { message: 'column ear_level does not exist' } })
    expect(await loadLevelProfile()).toEqual(emptyLevel())
  })
})
