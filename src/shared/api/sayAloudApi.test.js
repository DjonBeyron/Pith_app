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
vi.mock('./supabase.js', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))
vi.mock('./viewSession.js', () => ({ viewSession: async () => (session.user ? { user: session.user } : null) }))
vi.mock('../lib/debug.js', () => ({ dbg: () => {} }))
vi.mock('../lib/memoryChangedEvent.js', () => ({ notifyMemoryChanged: () => notify() }))

const { sendSayAloudResult } = await import('./sayAloudApi.js')
const { listGuestMemory, addDays } = await import('../lib/memory/guestMemory.js')
const { localDate } = await import('../lib/memory/dailyPick.js')

const today = localDate(new Date())
const put = rows => store.set('pithy_guest_memory_v1', JSON.stringify(Object.fromEntries(rows.map(r => [r.word, { step: 2, reviews: 0, lapses: 0, ...r }]))))

beforeEach(() => { store.clear(); rpc.mockReset(); notify.mockClear(); session.user = null })

describe('sendSayAloudResult — гость', () => {
  it('промах — слово завтра, верное не трогаем, RPC не зовётся, XP нет', async () => {
    put([{ word: 'keep', due_on: addDays(today, 10) }, { word: 'cook', due_on: addDays(today, 10) }])
    const res = await sendSayAloudResult([{ word: 'Keep', translation: 'держать', ok: false }, { word: 'cook', ok: true }])
    expect(res).toEqual({ ok: true, xp: 0, moved: 1 })
    const due = Object.fromEntries(listGuestMemory().map(m => [m.word, m.due_on]))
    expect(due).toEqual({ keep: addDays(today, 1), cook: addDays(today, 10) })
    expect(rpc).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('слово не в памяти или срок уже ближе — moved 0, без оповещения', async () => {
    put([{ word: 'keep', due_on: today }])
    expect(await sendSayAloudResult([{ word: 'keep', ok: false }, { word: 'ghost', ok: false }])).toEqual({ ok: true, xp: 0, moved: 0 })
    expect(notify).not.toHaveBeenCalled()
  })
  it('пустой раунд — null', async () => {
    expect(await sendSayAloudResult([])).toBeNull()
    expect(await sendSayAloudResult(null)).toBeNull()
  })
})

describe('sendSayAloudResult — вошедший', () => {
  beforeEach(() => { session.user = { id: 'u1' } })
  it('зовёт say_aloud_result только со словом и ok; XP возвращает; оповещает, если слова сдвинулись', async () => {
    rpc.mockResolvedValue({ data: { ok: true, xp: 2, moved: 1 }, error: null })
    const res = await sendSayAloudResult([{ word: 'keep', translation: 'держать', ok: true }, { word: 'cook', translation: 'готовить', ok: false }])
    expect(res).toEqual({ ok: true, xp: 2, moved: 1 })
    expect(rpc).toHaveBeenCalledWith('say_aloud_result', { p_items: [{ word: 'keep', ok: true }, { word: 'cook', ok: false }] })
    expect(notify).toHaveBeenCalledTimes(1)
  })
  it('сдвигов нет (одни попадания) — без оповещения', async () => {
    rpc.mockResolvedValue({ data: { ok: true, xp: 1, moved: 0 }, error: null })
    await sendSayAloudResult([{ word: 'keep', ok: true }])
    expect(notify).not.toHaveBeenCalled()
  })
  it('ошибка сервера — null, без оповещения', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: 'no function' } })
    expect(await sendSayAloudResult([{ word: 'keep', ok: false }])).toBeNull()
    expect(notify).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
