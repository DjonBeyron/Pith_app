import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = { row: null, error: null, reads: 0, writes: [], throwRead: false, saved: [{ key: 'race_scene_pauses' }] }
vi.mock('./supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => { db.reads++; if (db.throwRead) throw new Error('сети нет'); return Promise.resolve({ data: db.row, error: db.error }) } }) }),
      upsert: row => ({ select: () => { db.writes.push(row); return Promise.resolve({ data: db.saved, error: null }) } }),
    }),
  },
}))
const { readScenePauses, loadScenePauses, saveScenePauses, _resetScenePausesCache } = await import('./scenePausesApi.js')
const { pauseMs, commitPauses, resetPauses, pauseLayer } = await import('../lib/scenePauses.js')

// Паузы сценария на сервере (app_settings.race_scene_pauses): игровой путь не бросает и не применяет посреди игры; запись — только годное
beforeEach(() => { Object.assign(db, { row: null, error: null, reads: 0, writes: [], throwRead: false, saved: [{ key: 'race_scene_pauses' }] }); _resetScenePausesCache(); resetPauses() })

describe('чтение для игры', () => {
  it('один запрос на сеанс; значения кладутся в слой сервера и действуют со следующей сборки стадий (commitPauses), а не сразу', async () => {
    db.row = { value: { v: 1, pauses: { 'mia.intro': 800, 'good.delay': 1, 'нет.такой': 5 }, savedAt: 'x', by: 'u' } }
    const r = await loadScenePauses(); await loadScenePauses()
    expect(db.reads).toBe(1); expect(r.pauses).toEqual({ 'mia.intro': 800 }); expect(r.dropped.map(d => d.key)).toEqual(['good.delay', 'нет.такой'])
    expect(pauseMs('mia.intro')).toBe(0); commitPauses(); expect(pauseMs('mia.intro')).toBe(800); expect(pauseMs('good.delay')).toBe(500)
  })
  it('строки нет (или её не видно без белого списка), ошибка сервера, исключение сети, мусор в строке — игра на умолчаниях, наружу ничего не бросается', async () => {
    expect(await loadScenePauses()).toBeNull()
    _resetScenePausesCache(); db.error = { message: 'permission denied' }; expect(await loadScenePauses()).toBeNull(); expect((await readScenePauses()).ok).toBe(false)
    _resetScenePausesCache(); db.error = null; db.throwRead = true; await expect(loadScenePauses()).resolves.toBeNull()
    for (const junk of ['строка', 42, [1], { lines: {} }, { pauses: 'x' }]) { _resetScenePausesCache(); db.throwRead = false; db.row = { value: junk }; await expect(loadScenePauses({ fresh: true })).resolves.toBeTruthy(); commitPauses(); expect(pauseLayer('server')).toBeNull() }
  })
})

describe('запись (экран настроек)', () => {
  it('пишет { v, pauses, savedAt, by }; ответ { ok: true }; кэш сеанса и слой сервера обновлены', async () => {
    const r = await saveScenePauses({ 'mia.gap': 500 }, { by: 'admin-1' })
    expect(r.ok).toBe(true); expect(db.writes[0]).toMatchObject({ key: 'race_scene_pauses', value: { v: 1, pauses: { 'mia.gap': 500 }, by: 'admin-1' } }); expect(db.writes[0].value.savedAt).toBeTruthy()
    expect((await readScenePauses()).value.pauses).toEqual({ 'mia.gap': 500 }); expect(db.reads).toBe(0); expect(pauseLayer('server')).toEqual({ 'mia.gap': 500 })
  })
  it('негодное значение не пишется вовсе; сервер не подтвердил запись (не админ) — { ok: false } с причиной', async () => {
    const bad = await saveScenePauses({ 'mia.gap': 5, 'good.delay': 600 })
    expect(bad.ok).toBe(false); expect(bad.error).toContain('mia.gap'); expect(db.writes).toHaveLength(0)
    db.saved = []
    const denied = await saveScenePauses({ 'mia.gap': 500 })
    expect(denied).toMatchObject({ ok: false }); expect(denied.error).toContain('права админа'); expect(pauseLayer('server')).toBeNull()
  })
  it('пустой набор — «всё по умолчанию» для всех', async () => {
    expect((await saveScenePauses({})).value.pauses).toEqual({}); expect(pauseLayer('server')).toBeNull()
  })
})
