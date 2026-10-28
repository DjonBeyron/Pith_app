import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мок supabase: цепочка from().select().order() / .eq().single() / .update().eq().
// Ответ подбирается по списку колонок select — так проверяем ярусы мягкой деградации
const calls = []
let answer = () => ({ data: [], error: null })
const chain = (op) => {
  const c = {
    select: cols => { op.cols = cols; return c },
    update: patch => { op.patch = patch; return c },
    eq: (k, v) => { op.eq = [k, v]; return c },
    order: () => c,
    single: () => c,
    then: (res, rej) => Promise.resolve(answer(op)).then(res, rej),
  }
  return c
}
vi.mock('../api/supabase.js', () => ({
  supabase: { from: table => { const op = { table }; calls.push(op); return chain(op) } },
}))
vi.mock('./debug.js', () => ({ dbg: () => {} }))

const api = await import('./curriculaApi.js')

const missing = col => ({ data: null, error: { message: `column curricula.${col} does not exist` } })
const ROW = { id: 'm1', title: 'Hi', scene_id: 's1', title_translation: 'Привет' }

beforeEach(() => { calls.length = 0; answer = () => ({ data: [ROW], error: null }) })

describe('loadCurricula: ярусы колонок', () => {
  it('все колонки есть — один запрос со scene_id и difficulty_admin', async () => {
    const rows = await api.loadCurricula()
    expect(calls).toHaveLength(1)
    expect(calls[0].cols).toMatch(/scene_id/)
    expect(calls[0].cols).toMatch(/difficulty_admin/)
    expect(rows[0].scene_id).toBe('s1')
  })
  it('нет difficulty_admin → повтор без неё, сцена и переводы остаются', async () => {
    answer = op => (/difficulty_admin/.test(op.cols) ? missing('difficulty_admin') : { data: [ROW], error: null })
    const rows = await freshLoad()
    expect(calls).toHaveLength(2)
    expect(calls[1].cols).toMatch(/scene_id/)
    expect(calls[1].cols).toMatch(/title_translation/)
    expect(calls[1].cols).not.toMatch(/difficulty_admin/)
    expect(rows[0].scene_id).toBe('s1')
  })
  it('нет scene_id → повтор без него, переводы остаются', async () => {
    answer = op => (/scene_id/.test(op.cols) ? missing('scene_id') : { data: [{ id: 'm1', title_translation: 'Привет' }], error: null })
    // shareInFlight склеивает запросы в пределах 1.5 с — ждём по фейковым часам нельзя, поэтому
    // проверяем ответ: без колонки строки приходят без scene_id, падения нет
    const rows = await freshLoad()
    expect(calls.map(c => c.cols)).toHaveLength(3) // полный набор, без difficulty_admin (колонки нет и там), без scene_id
    expect(calls[2].cols).toMatch(/title_translation/)
    expect(calls[2].cols).not.toMatch(/scene_id|difficulty_admin/)
    expect(rows[0].scene_id).toBeUndefined()
  })
  it('нет и переводов → базовый набор колонок', async () => {
    answer = op => (/scene_id/.test(op.cols) ? missing('scene_id')
      : /title_translation/.test(op.cols) ? missing('title_translation') : { data: [{ id: 'm1' }], error: null })
    const rows = await freshLoad()
    expect(calls).toHaveLength(4)
    expect(calls[3].cols).not.toMatch(/title_translation|scene_id|difficulty_admin/)
    expect(rows).toEqual([{ id: 'm1' }])
  })
  it('другая ошибка — пробрасывается, без лишних повторов', async () => {
    answer = () => ({ data: null, error: { message: 'network down' } })
    await expect(freshLoad()).rejects.toMatchObject({ message: 'network down' })
    expect(calls).toHaveLength(1)
  })
})

// loadCurricula делит запрос в полёте 1.5 с (shareInFlight) — между тестами сдвигаем часы
let now = 0
async function freshLoad() {
  now += 10_000
  vi.spyOn(Date, 'now').mockReturnValue(now)
  try { return await api.loadCurricula() } finally { vi.restoreAllMocks() }
}

describe('updateCurriculumScene', () => {
  it('пишет scene_id по id модуля', async () => {
    answer = () => ({ error: null })
    await api.updateCurriculumScene('m1', 's9')
    expect(calls[0]).toMatchObject({ table: 'curricula', patch: { scene_id: 's9' }, eq: ['id', 'm1'] })
  })
  it('null/undefined → scene_id: null (убрать сцену)', async () => {
    answer = () => ({ error: null })
    await api.updateCurriculumScene('m1', undefined)
    expect(calls[0].patch).toEqual({ scene_id: null })
  })
  it('ошибка БД пробрасывается', async () => {
    answer = () => ({ error: { message: 'permission denied' } })
    await expect(api.updateCurriculumScene('m1', 's1')).rejects.toMatchObject({ message: 'permission denied' })
  })
})

describe('setCurriculumDifficultyAdmin', () => {
  it('пишет difficulty_admin по id модуля; undefined → null («авто»)', async () => {
    answer = () => ({ error: null })
    await api.setCurriculumDifficultyAdmin('m1', 2)
    expect(calls[0]).toMatchObject({ table: 'curricula', patch: { difficulty_admin: 2 }, eq: ['id', 'm1'] })
    await api.setCurriculumDifficultyAdmin('m1', undefined)
    expect(calls[1].patch).toEqual({ difficulty_admin: null })
  })
  it('ошибка БД пробрасывается', async () => {
    answer = () => ({ error: { message: 'permission denied' } })
    await expect(api.setCurriculumDifficultyAdmin('m1', 1)).rejects.toMatchObject({ message: 'permission denied' })
  })
})

describe('loadCurriculumMedia', () => {
  it('со scene_id', async () => {
    answer = () => ({ data: { video_url: 'v', scene_id: 's1' }, error: null })
    const d = await api.loadCurriculumMedia('m1')
    expect(calls[0].cols).toMatch(/scene_id/)
    expect(d.scene_id).toBe('s1')
  })
  it('нет колонки → повтор без неё', async () => {
    answer = op => (/scene_id/.test(op.cols) ? missing('scene_id') : { data: { video_url: 'v' }, error: null })
    const d = await api.loadCurriculumMedia('m1')
    expect(calls).toHaveLength(2)
    expect(d).toEqual({ video_url: 'v' })
  })
})
