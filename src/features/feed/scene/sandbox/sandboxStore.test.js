import { describe, it, expect, vi } from 'vitest'
import { createFeedSceneStore } from '../feedSceneStore.js'
import { createSceneCache } from '../feedSceneCache.js'
import { SANDBOX_ID } from './feedSandbox.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

// feedSceneStore: особый id '__sandbox__' — сцена из песочницы, статус ready, ни запроса, ни кэша
function setup(initial) {
  let sb = initial
  const subs = new Set()
  const sandbox = { read: () => sb, subscribe: fn => { subs.add(fn); return () => subs.delete(fn) } }
  const fetch = vi.fn(async () => [])
  const put = vi.fn()
  const cache = { ...createSceneCache({ storage: null }), put }
  const queue = []
  const store = createFeedSceneStore({ fetch, cache, sandbox, schedule: fn => queue.push(fn) })
  return { store, fetch, put, queue, set: v => { sb = v; subs.forEach(f => f()) } }
}
const SB = { scene: demoOfficeScene, taskForce: false, createdAt: 5 }

describe('feedSceneStore — песочница без сети', () => {
  it('get отдаёт ready со сценой, request ничего не запрашивает и не кэширует', async () => {
    const { store, fetch, put, queue } = setup(SB)
    store.request(SANDBOX_ID)
    expect(queue).toHaveLength(0) // батч не планировался
    const e = store.get(SANDBOX_ID)
    expect(e.status).toBe('ready')
    expect(e.scene.title).toBe(demoOfficeScene.title)
    expect(store.get(SANDBOX_ID)).toBe(e) // стабильный снимок
    expect(fetch).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(store.stats()).toEqual({ fetches: 0, entries: 0 })
  })
  it('новая запись — новое состояние и уведомление подписчиков; закрыли — missing', () => {
    const { store, set } = setup(SB)
    const spy = vi.fn()
    const off = store.subscribe(spy)
    const first = store.get(SANDBOX_ID)
    set({ ...SB, createdAt: 6 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(store.get(SANDBOX_ID)).not.toBe(first)
    set(null)
    expect(store.get(SANDBOX_ID).status).toBe('missing')
    off()
    set(SB)
    expect(spy).toHaveBeenCalledTimes(2)
  })
  it('сцена не по схеме → invalid (слайд покажет заглушку)', () => {
    const { store } = setup({ scene: { nope: 1 }, taskForce: false, createdAt: 1 })
    expect(store.get(SANDBOX_ID).status).toBe('invalid')
  })
  it('обычные id по-прежнему идут через сеть', async () => {
    const { store, fetch, queue } = setup(SB)
    store.request('real')
    await queue.shift()()
    expect(fetch).toHaveBeenCalledWith(['real'])
  })
})
