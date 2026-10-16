import { describe, it, expect, vi } from 'vitest'
import { createFeedSceneStore, resolveRow, IDLE } from './feedSceneStore.js'
import { createSceneCache } from './feedSceneCache.js'
import { demoOfficeScene, demoCafeScene } from '../../scene/v2/demoScenes.js'

// Стор без сети: fetch — спай, планировщик батча — ручной (flush()), кэш — в памяти

function memStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), map: m }
}

function setup({ rows = [], fail = false, storage = memStorage() } = {}) {
  const queue = []
  const fetch = vi.fn(async ids => {
    if (fail) throw new Error('сеть')
    return rows.filter(r => ids.includes(r.id))
  })
  const cache = createSceneCache({ storage, now: () => 1000, schedule: fn => fn() })
  const store = createFeedSceneStore({ fetch, cache, schedule: fn => queue.push(fn) })
  const flush = async () => { while (queue.length) await queue.shift()() }
  return { store, fetch, flush, cache, storage }
}

const ROW_A = { id: 'a', scene: demoOfficeScene, updated_at: '2026-10-14T10:00:00Z' }
const ROW_B = { id: 'b', scene: demoCafeScene, updated_at: '2026-10-14T11:00:00Z' }

describe('feedSceneStore — батч, дедуп, кэш, деградация', () => {
  it('до запроса — idle; запрошенные в одном тике id уходят ОДНИМ запросом', async () => {
    const { store, fetch, flush } = setup({ rows: [ROW_A, ROW_B] })
    expect(store.get('a')).toBe(IDLE)
    store.request('a')
    store.request('b')
    store.request('a') // дубль в том же тике
    expect(store.get('a').status).toBe('loading')
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toEqual(['a', 'b'])
    expect(store.get('a').status).toBe('ready')
    expect(store.get('a').scene.title).toBe('Про работу')
    expect(store.get('b').status).toBe('ready')
  })

  it('повторный request того же id за сессию запрос не шлёт', async () => {
    const { store, fetch, flush } = setup({ rows: [ROW_A] })
    store.request('a')
    await flush()
    store.request('a')
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(store.stats().fetches).toBe(1)
  })

  it('строки нет в ответе (не опубликована / RLS) → missing; ошибка сети → missing', async () => {
    const ok = setup({ rows: [] })
    ok.store.request('x')
    await ok.flush()
    expect(ok.store.get('x').status).toBe('missing')
    const bad = setup({ fail: true })
    bad.store.request('y')
    await bad.flush()
    expect(bad.store.get('y').status).toBe('missing')
  })

  it('сцена не проходит валидацию → invalid (лента покажет видео)', async () => {
    const { store, flush } = setup({ rows: [{ id: 'bad', scene: { ...demoOfficeScene, version: 1 }, updated_at: null }] })
    store.request('bad')
    await flush()
    expect(store.get('bad').status).toBe('invalid')
    expect(store.get('bad').scene).toBeNull()
  })

  it('кэш: готов сразу (loading не бывает), сеть без ответа кэш не портит, новая updated_at подменяет сцену', async () => {
    const storage = memStorage()
    const first = setup({ rows: [ROW_A], storage })
    first.store.request('a')
    await first.flush()
    expect(JSON.parse(storage.getItem('pithy_feed_scenes_v1')).a.updated_at).toBe(ROW_A.updated_at)

    // Новая сессия, сеть упала — сцена из кэша
    const offline = setup({ fail: true, storage })
    offline.store.request('a')
    expect(offline.store.get('a').status).toBe('ready')
    await offline.flush()
    expect(offline.store.get('a').status).toBe('ready')

    // Сервер отдал обновлённую строку — сцена подменяется
    const newer = { ...ROW_A, scene: { ...demoOfficeScene, title: 'Новое' }, updated_at: '2026-10-15T00:00:00Z' }
    const fresh = setup({ rows: [newer], storage })
    fresh.store.request('a')
    expect(fresh.store.get('a').scene.title).toBe('Про работу')
    await fresh.flush()
    expect(fresh.store.get('a').scene.title).toBe('Новое')

    // Сняли с публикации — сервер ответил без строки: кэш не главнее, missing
    const gone = setup({ rows: [], storage })
    gone.store.request('a')
    await gone.flush()
    expect(gone.store.get('a').status).toBe('missing')
  })

  it('подписчики узнают о смене статуса', async () => {
    const { store, flush } = setup({ rows: [ROW_A] })
    const spy = vi.fn()
    store.subscribe(spy)
    store.request('a')
    await flush()
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('слушатели песочницы — один на стор, а не по одному на каждый слайд', () => {
    const off = vi.fn()
    const sub = vi.fn(() => off)
    const store = createFeedSceneStore({ fetch: async () => [], sandbox: { read: () => null, subscribe: sub } })
    const a = store.subscribe(() => {}); const b = store.subscribe(() => {}); const c = store.subscribe(() => {})
    expect(sub).toHaveBeenCalledTimes(1)
    a(); b()
    expect(off).not.toHaveBeenCalled()
    c()
    expect(off).toHaveBeenCalledTimes(1)
    store.subscribe(() => {})
    expect(sub).toHaveBeenCalledTimes(2)
  })

  it('resolveRow нормализует сцену (options/voice подставлены)', () => {
    const r = resolveRow(ROW_A)
    expect(r.status).toBe('ready')
    expect(r.scene.options.loop).toBe(false)
    expect(r.scene.characters.a.voice.pitch).toBe(0.8)
    expect(resolveRow({ id: 'z', scene: null }).status).toBe('invalid')
  })
})
