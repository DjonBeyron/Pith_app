import { describe, it, expect, vi } from 'vitest'
import { createVoiceStore, MAX_CLIPS, MAX_BYTES } from './sayVoiceStore.js'

// Реестр голосовых ответов на сессию урока: put/get/revoke/clearAll, лимиты и выселение самых старых, подписка для пузырей.
const blob = size => ({ size })
function make(opts) {
  const made = []
  const freed = []
  const store = createVoiceStore({ makeUrl: b => { const u = `blob:x${made.length}`; made.push([u, b.size]); return u }, freeUrl: u => freed.push(u), ...opts })
  return { store, made, freed }
}

describe('sayVoiceStore: положить / взять / освободить', () => {
  it('put даёт voiceId, get отдаёт url/длительность/столбики; пустой или слишком большой blob не принимается', () => {
    const { store, made } = make({ maxBytes: 1000 })
    const id = store.put(blob(100), { durationMs: 1234.6, peaks: [0, 0.5, 1] })
    expect(id).toMatch(/^sv\d+$/)
    expect(store.get(id)).toMatchObject({ url: made[0][0], durationMs: 1235, peaks: [0, 0.5, 1], size: 100 })
    expect(store.put(blob(0))).toBeNull()
    expect(store.put(null)).toBeNull()
    expect(store.put(blob(1001))).toBeNull() // больше всего лимита — не принимаем и ничего не выселяем
    expect(store.stats()).toEqual({ clips: 1, bytes: 100 })
  })
  it('revoke освобождает blob-URL и память; повтор и чужой id безопасны', () => {
    const { store, freed } = make()
    const a = store.put(blob(10)); const b = store.put(blob(20))
    store.revoke(a); store.revoke(a); store.revoke('нет такого')
    expect(freed).toEqual(['blob:x0'])
    expect(store.get(a)).toBeNull()
    expect(store.has(b)).toBe(true)
    expect(store.stats()).toEqual({ clips: 1, bytes: 20 })
  })
  it('revokeMany игнорирует пустые id; clearAll отзывает все URL (закрытие урока) и повторно безопасен', () => {
    const { store, freed } = make()
    const ids = [store.put(blob(1)), store.put(blob(2)), store.put(blob(3))]
    store.revokeMany([ids[0], null, undefined, ids[1]])
    expect(freed).toEqual(['blob:x0', 'blob:x1'])
    store.clearAll(); store.clearAll()
    expect(freed).toHaveLength(3)
    expect(store.stats()).toEqual({ clips: 0, bytes: 0 })
    expect(ids.map(id => store.get(id))).toEqual([null, null, null])
  })
  it('нет blob-URL (createObjectURL упал) → null, реестр не портится', () => {
    const store = createVoiceStore({ makeUrl: () => { throw new Error('нет URL') }, freeUrl: () => {} })
    expect(store.put(blob(10))).toBeNull()
    expect(store.stats().clips).toBe(0)
  })
})

describe('sayVoiceStore: лимиты и выселение', () => {
  it('по числу клипов: при превышении уходят самые старые, их URL отозваны; новый всегда принят', () => {
    const { store, freed } = make({ maxClips: 3 })
    const ids = [1, 2, 3, 4, 5].map(n => store.put(blob(n)))
    expect(store.stats().clips).toBe(3)
    expect(ids.map(id => store.has(id))).toEqual([false, false, true, true, true])
    expect(freed).toEqual(['blob:x0', 'blob:x1'])
  })
  it('по объёму: суммарно не больше maxBytes, выселяются самые старые', () => {
    const { store } = make({ maxBytes: 100 })
    const a = store.put(blob(60)); const b = store.put(blob(30))
    const c = store.put(blob(40)) // 60+30+40 > 100 → уходит a
    expect([store.has(a), store.has(b), store.has(c)]).toEqual([false, true, true])
    expect(store.stats().bytes).toBe(70)
  })
  it('значения по умолчанию: ≤ 40 клипов и ≤ 25 МБ', () => {
    expect(MAX_CLIPS).toBe(40)
    expect(MAX_BYTES).toBe(25 * 1048576)
  })
})

describe('sayVoiceStore: подписка пузырей', () => {
  it('версия растёт на put/revoke/clearAll (и только когда что-то изменилось); подписчик вызывается, сбой подписчика не ломает реестр', () => {
    const { store } = make()
    const fn = vi.fn()
    const off = store.subscribe(fn)
    store.subscribe(() => { throw new Error('плохой подписчик') })
    const v0 = store.getVersion()
    const id = store.put(blob(5))
    store.revoke('нет такого') // ничего не изменилось
    expect(store.getVersion()).toBe(v0 + 1)
    store.revoke(id)
    store.clearAll() // пусто — тишина
    expect(store.getVersion()).toBe(v0 + 2)
    expect(fn).toHaveBeenCalledTimes(2)
    off(); store.put(blob(5))
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
