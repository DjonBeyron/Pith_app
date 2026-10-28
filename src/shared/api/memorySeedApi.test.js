import { describe, it, expect, vi, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модулей
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const rpc = vi.fn()
const session = { user: null }
const notify = vi.fn()
const flags = vi.fn()
vi.mock('./supabase.js', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
  },
}))
vi.mock('./viewSession.js', () => ({ viewSession: async () => (session.user ? { user: session.user } : null) }))
vi.mock('../lib/debug.js', () => ({ dbg: () => {} }))
vi.mock('../lib/memoryChangedEvent.js', () => ({ notifyMemoryChanged: () => notify() }))
vi.mock('../lib/lessonsApi.js', () => ({ listLessonDeckFlags: () => flags() }))

const { seedMemoryWord, canSeedWord, resetDeckCache } = await import('./memorySeedApi.js')
const { listGuestMemory } = await import('../lib/memory/guestMemory.js')

beforeEach(() => {
  store.clear(); rpc.mockReset(); notify.mockClear(); flags.mockReset(); resetDeckCache()
  session.user = null
})

describe('seedMemoryWord — гость', () => {
  it('слово — в локальную память (шаг 1), RPC не зовётся, панель оповещена', async () => {
    const res = await seedMemoryWord('Keep,', 'm1')
    expect(res).toMatchObject({ ok: true, word: 'keep', created: true })
    expect(listGuestMemory().map(m => [m.word, m.step])).toEqual([['keep', 1]])
    expect(rpc).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('не слово (кириллица) — ничего не записано', async () => {
    expect(await seedMemoryWord('привет', 'm1')).toEqual({ ok: false, reason: 'word' })
    expect(listGuestMemory()).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('seedMemoryWord — вошедший', () => {
  beforeEach(() => { session.user = { id: 'u1' } })
  it('зовёт memory_seed_word и оповещает при успехе', async () => {
    rpc.mockResolvedValue({ data: { ok: true, word: 'keep', created: true }, error: null })
    expect(await seedMemoryWord('keep', 'm1')).toMatchObject({ ok: true, created: true })
    expect(rpc).toHaveBeenCalledWith('memory_seed_word', { p_word: 'keep', p_module_id: 'm1' })
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('ошибка сервера — null и без оповещения', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: 'no function' } })
    expect(await seedMemoryWord('keep')).toBeNull()
    expect(notify).not.toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('canSeedWord', () => {
  const rows = [{ id: 'a', title: 'keep', deck: 'c1' }, { id: 'b', title: 'cook', deck: null }]
  it('есть колода и нет в памяти — можно', async () => {
    flags.mockResolvedValue(rows)
    expect(await canSeedWord('Keep')).toBe(true)
  })
  it('нет колоды — нельзя', async () => {
    flags.mockResolvedValue(rows)
    expect(await canSeedWord('cook')).toBe(false)
    expect(await canSeedWord('unknown')).toBe(false)
  })
  it('уже в памяти — нельзя', async () => {
    flags.mockResolvedValue(rows)
    await seedMemoryWord('keep')
    expect(await canSeedWord('keep')).toBe(false)
  })
  it('сбой запроса уроков — нельзя, без исключения', async () => {
    flags.mockRejectedValue(new Error('net'))
    expect(await canSeedWord('keep')).toBe(false)
  })
})
