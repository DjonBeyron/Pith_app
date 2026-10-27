import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const maybeSingle = vi.fn()
const upsertSelect = vi.fn()
const upsert = vi.fn(() => ({ select: upsertSelect }))
vi.mock('./supabase.js', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }), upsert: (...a) => upsert(...a) }),
  },
}))
vi.mock('../lib/debug.js', () => ({ dbg: () => {} }))

const { syncPromptGroup, loadPromptShare, savePromptShare } = await import('./promptGroupApi.js')
const { currentGroup, resetGroupMemo, GROUP_KEY, SHARE_CACHE_KEY } = await import('../lib/prompts/promptGroup.js')

let data
beforeEach(() => {
  rpc.mockReset(); maybeSingle.mockReset(); upsertSelect.mockReset(); upsert.mockClear()
  data = { pithy_anon_id: 'anon-1' }
  vi.stubGlobal('localStorage', { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v) } })
  resetGroupMemo()
})

describe('syncPromptGroup', () => {
  it('отдаёт серверу группу устройства и принимает группу профиля', async () => {
    const mine = currentGroup()
    const other = mine === 'control' ? 'prompts' : 'control'
    rpc.mockResolvedValue({ data: other, error: null })
    expect(await syncPromptGroup()).toBe(other)
    expect(rpc).toHaveBeenCalledWith('set_prompt_group', { p_group: mine })
    expect(JSON.parse(data[GROUP_KEY]).group).toBe(other)
  })
  it('ошибка или пустой ответ — группа не меняется, исключений нет', async () => {
    const mine = currentGroup()
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await syncPromptGroup()).toBeNull()
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await syncPromptGroup()).toBeNull()
    rpc.mockRejectedValue(new Error('сеть'))
    expect(await syncPromptGroup()).toBeNull()
    expect(currentGroup()).toBe(mine)
  })
})

describe('loadPromptShare', () => {
  it('читает долю и кладёт в кэш (с зажимом)', async () => {
    maybeSingle.mockResolvedValue({ data: { value: { share: 30 } }, error: null })
    expect(await loadPromptShare()).toBe(30)
    expect(JSON.parse(data[SHARE_CACHE_KEY])).toBe(30)
    maybeSingle.mockResolvedValue({ data: { value: { share: 99 } }, error: null })
    expect(await loadPromptShare()).toBe(50)
  })
  it('строки нет — доля по умолчанию; ошибка — null и кэш не тронут', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await loadPromptShare()).toBe(10)
    data[SHARE_CACHE_KEY] = '25'
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'rls' } })
    expect(await loadPromptShare()).toBeNull()
    expect(data[SHARE_CACHE_KEY]).toBe('25')
  })
})

describe('savePromptShare', () => {
  it('upsert в app_settings.prompt_control с зажатой долей и обновлением кэша', async () => {
    upsertSelect.mockResolvedValue({ data: [{ key: 'prompt_control' }], error: null })
    expect(await savePromptShare(70)).toBe(50)
    expect(upsert.mock.calls[0][0]).toMatchObject({ key: 'prompt_control', value: { share: 50 } })
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'key' })
    expect(JSON.parse(data[SHARE_CACHE_KEY])).toBe(50)
  })
  it('ошибка сервера и «пустой» успех (RLS) — исключение', async () => {
    upsertSelect.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(savePromptShare(5)).rejects.toBeTruthy()
    upsertSelect.mockResolvedValue({ data: [], error: null })
    await expect(savePromptShare(5)).rejects.toThrow('не подтвердил')
  })
})
