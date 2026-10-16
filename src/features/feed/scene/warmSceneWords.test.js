import { describe, it, expect, vi, afterEach } from 'vitest'
import { warmSceneWords } from './warmSceneWords.js'
import { createFeedSceneStore } from './feedSceneStore.js'
import { createSceneCache } from './feedSceneCache.js'
import { setWordAudioSource } from '../../../shared/lib/wordAudio/wordAudioLookup.js'
import { fillSceneVars } from '../../scene/v2/sceneVars.js'
import { demoTemplateScene } from '../../scene/v2/demoScenes.js'

// Прогрев озвучки слов шаблонной сцены в ленте: нет слов-сегментов без аудио — сеть не трогаем; пришла озвучка — сцена подменяется
const withSeg = () => {
  const s = JSON.parse(JSON.stringify(demoTemplateScene))
  s.timeline[0].segments = [{ text: 'Can I have' }, { var: 'food' }, { text: ', please?' }]
  return s
}
afterEach(() => setWordAudioSource(null))

describe('warmSceneWords', () => {
  it('сцена без слов-сегментов — ensure не вызывается', () => {
    const ensure = vi.fn()
    expect(warmSceneWords({ timeline: [{ who: 'a', text: 'Hi.' }] }, vi.fn(), { ensure })).toBe(false)
    expect(ensure).not.toHaveBeenCalled()
  })
  it('есть слова без аудио → один ensure по текстам; озвучка нашлась → apply(сцена с audioUrl слова); не нашлась — тишина', async () => {
    const filled = fillSceneVars(withSeg(), {}, { wordAudio: null })
    const apply = vi.fn()
    setWordAudioSource(key => (key === 'a sandwich' ? { url: 'https://r2/sw.mp3', duration: 1 } : null))
    const ensure = vi.fn().mockResolvedValue(true)
    expect(warmSceneWords(filled, apply, { ensure })).toBe(true)
    await Promise.resolve(); await Promise.resolve()
    expect(ensure).toHaveBeenCalledWith(['a sandwich'])
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0][0].timeline[0].segments[1].audioUrl).toBe('https://r2/sw.mp3')
    const apply2 = vi.fn()
    warmSceneWords(filled, apply2, { ensure: vi.fn().mockResolvedValue(false) })
    await Promise.resolve(); await Promise.resolve()
    expect(apply2).not.toHaveBeenCalled()
  })
})

describe('feedSceneStore — прогрев слов после загрузки', () => {
  it('ready-сцена подменяется на версию с озвучкой слов, подписчики уведомляются; шаблон отдаётся сразу (не ждёт сеть)', async () => {
    const queue = []
    const warm = vi.fn((scene, apply) => { queue.push(() => apply({ ...scene, title: 'с озвучкой слов' })); return true })
    const cache = createSceneCache({ storage: { getItem: () => null, setItem: () => {} }, now: () => 1, schedule: fn => fn() })
    const rows = [{ id: 't', scene: withSeg(), updated_at: '2026-10-16T10:00:00Z' }]
    const batch = []
    const store = createFeedSceneStore({ fetch: async ids => rows.filter(r => ids.includes(r.id)), cache, schedule: fn => batch.push(fn), warm })
    const seen = vi.fn()
    store.subscribe(seen)
    store.request('t')
    while (batch.length) await batch.shift()()
    expect(store.get('t').status).toBe('ready')
    expect(store.get('t').scene.timeline[0].segments[1]).toMatchObject({ word: true, text: 'a sandwich' })
    expect(warm).toHaveBeenCalledTimes(1)
    seen.mockClear()
    queue.shift()()
    expect(store.get('t').scene.title).toBe('с озвучкой слов')
    expect(seen).toHaveBeenCalledTimes(1)
  })
  it('песочница: сцена записи прогревается один раз на запись', () => {
    const warm = vi.fn()
    const rec = { scene: withSeg(), createdAt: 5 }
    const store = createFeedSceneStore({ fetch: async () => [], cache: createSceneCache({ storage: { getItem: () => null, setItem: () => {} }, now: () => 1, schedule: fn => fn() }), warm, sandbox: { read: () => rec, subscribe: () => () => {} } })
    store.get('__sandbox__'); store.get('__sandbox__')
    expect(warm).toHaveBeenCalledTimes(1)
  })
})
