import { describe, it, expect } from 'vitest'
import { fakeCaches } from './voskTestKit.js'
import { CACHE_NAME, LIB_DB, cacheKey, cacheAvailable, peekCached, readCached, saveModel, deleteModel, deleteLibraryStore, storageInfo, requestPersist } from './voskStorage.js'

const blobOf = n => new Blob([new Uint8Array(n).fill(7)])
const URL1 = 'https://pub-1.r2.dev/chat/model.gz'

describe('voskStorage: ключ и кеш', () => {
  it('имя кеша и ключ = полный URL без фрагмента', () => {
    expect(CACHE_NAME).toBe('vosk-models-v1')
    expect(cacheKey('https://h/a/m.tar.gz#x')).toBe('https://h/a/m.tar.gz')
    expect(cacheKey('/models/m.tar.gz', 'https://app.vercel.app/admin')).toBe('https://app.vercel.app/models/m.tar.gz')
  })
  it('кеша нет (http, старый браузер) — не падаем', async () => {
    expect(cacheAvailable(undefined)).toBe(false)
    expect(await peekCached(URL1, undefined)).toBeNull()
    expect(await readCached(URL1, undefined)).toBeNull()
    await expect(saveModel(URL1, blobOf(5), undefined)).rejects.toMatchObject({ code: 'nocache' })
  })
  it('сохранили → статус, чтение из кеша; чужой адрес не находится', async () => {
    const c = fakeCaches()
    expect(await peekCached(URL1, c)).toBeNull()
    await saveModel(URL1, blobOf(1000), c)
    expect((await peekCached(URL1, c)).size).toBe(1000)
    const r = await readCached(URL1, c)
    expect(r.size).toBe(1000)
    expect(r.blob.size).toBe(1000)
    expect(await readCached('https://other/m.gz', c)).toBeNull()
  })
  it('запись с размером, не совпавшим с записанным, считается битой и удаляется', async () => {
    const c = fakeCaches()
    const cache = await c.open(CACHE_NAME)
    await cache.put(cacheKey(URL1), new Response(blobOf(500), { headers: { 'x-vosk-size': '999' } }))
    expect(await readCached(URL1, c)).toBeNull()
    expect(await peekCached(URL1, c)).toBeNull()
  })
  it('нет места: понятная ошибка quota, недописанная запись не остаётся', async () => {
    const c = fakeCaches({ putError: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) })
    await expect(saveModel(URL1, blobOf(10), c)).rejects.toMatchObject({ code: 'quota' })
    expect(await peekCached(URL1, c)).toBeNull()
  })
  it('удаление модели чистит кеш и распакованную копию библиотеки', async () => {
    const c = fakeCaches()
    await saveModel(URL1, blobOf(10), c)
    const dropped = []
    const idb = { deleteDatabase: name => { dropped.push(name); const req = {}; setTimeout(() => req.onsuccess?.(), 0); return req } }
    expect(await deleteModel(c, idb)).toBe(true)
    expect(c.has(CACHE_NAME)).toBe(false)
    expect(dropped).toEqual([LIB_DB])
    expect(await peekCached(URL1, c)).toBeNull()
  })
})

describe('voskStorage: IndexedDB библиотеки', () => {
  it('нет indexedDB / ошибка / зависшее удаление — не висим', async () => {
    expect(await deleteLibraryStore(undefined)).toBe('none')
    expect(await deleteLibraryStore({ deleteDatabase() { throw new Error('x') } })).toBe('error')
    expect(await deleteLibraryStore({ deleteDatabase: () => ({}) }, 10)).toBe('timeout')
  })
})

describe('voskStorage: квота и закрепление', () => {
  it('estimate и persisted; нет API — null', async () => {
    const nav = { storage: { estimate: async () => ({ usage: 100, quota: 1000 }), persisted: async () => true } }
    expect(await storageInfo(nav)).toEqual({ usage: 100, quota: 1000, persisted: true })
    expect(await storageInfo({})).toEqual({ usage: null, quota: null, persisted: null })
  })
  it('persist: разрешили / отказали / браузер не умеет', async () => {
    expect(await requestPersist({ storage: { persist: async () => true } })).toEqual({ supported: true, granted: true })
    expect(await requestPersist({ storage: { persist: async () => false } })).toEqual({ supported: true, granted: false })
    expect(await requestPersist({ storage: { persist: async () => { throw new Error('x') } } })).toEqual({ supported: true, granted: false })
    expect(await requestPersist({})).toEqual({ supported: false, granted: false })
  })
})
