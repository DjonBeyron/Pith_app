import { describe, it, expect } from 'vitest'
import { nodeDownloads, buildItemQueue } from './preloadQueue.js'
import { isNodeWarm } from './preloadWarm.js'

// Прогрев ноды scene: файлов у неё нет (сцена — JSON внутри ноды), поэтому она
// «прогрета» сразу; есть audioUrl у реплик — они встают в очередь как файлы ноды
const sceneNode = (timeline) => ({ id: 's1', seq: 1, type: 'scene', typeData: { scene: { scene: { version: 2, timeline } } }, triggers: [] })

describe('preload — нода scene', () => {
  it('без audioUrl — очередь пустая, нода тёплая', () => {
    const n = sceneNode([{ who: 'a', text: 'Привет.' }])
    const items = nodeDownloads(n, [])
    expect(items).toEqual([])
    expect(isNodeWarm(items, {})).toBe(true)
    expect(buildItemQueue([n], [], new Set(['scene']))).toEqual([])
  })

  it('с audioUrl — по файлу на уникальную ссылку, тёплая после скачивания', () => {
    const n = sceneNode([
      { who: 'a', text: 'Hi.', audioUrl: 'https://r2.dev/a.mp3' },
      { who: 'b', text: 'Yo.', audioUrl: 'https://r2.dev/b.mp3' },
      { who: 'a', text: 'Again.', audioUrl: 'https://r2.dev/a.mp3' },
      { who: 'b', text: 'blob is not a download', audioUrl: 'blob:local' },
    ])
    const items = nodeDownloads(n, [])
    expect(items.map(i => i.url)).toEqual(['https://r2.dev/a.mp3', 'https://r2.dev/b.mp3'])
    expect(items[0]).toMatchObject({ id: 'https://r2.dev/a.mp3', nodeType: 'scene', size: 0 })
    expect(isNodeWarm(items, {})).toBe(false)
    expect(isNodeWarm(items, { 'https://r2.dev/a.mp3': { blobUrl: 'blob:1' }, 'https://r2.dev/b.mp3': { blobUrl: 'blob:2' } })).toBe(true)
    const q = buildItemQueue([n], [], new Set(['scene']))
    expect(q).toHaveLength(2)
    expect(q[0]).toMatchObject({ nodeId: 's1', nodeSeq: 1 })
  })

  it('файлы перевода — только когда озвучка перевода включена (сценой или переопределением ноды)', () => {
    const tl = [{ who: 'a', text: 'Hi.', translation: 'Привет.', audioUrl: 'https://r2.dev/a.mp3', translationAudioUrl: 'https://r2.dev/a-tr.mp3' }]
    const plain = sceneNode(tl)
    expect(nodeDownloads(plain, []).map(i => i.url)).toEqual(['https://r2.dev/a.mp3'])
    const bySceneRaw = sceneNode(tl)
    bySceneRaw.typeData.scene.scene.options = { voice: { translation: true } }
    expect(nodeDownloads(bySceneRaw, []).map(i => i.url)).toEqual(['https://r2.dev/a.mp3', 'https://r2.dev/a-tr.mp3'])
    const byNode = sceneNode(tl)
    byNode.typeData.scene.voice = { translation: true }
    expect(nodeDownloads(byNode, []).map(i => i.url)).toEqual(['https://r2.dev/a.mp3', 'https://r2.dev/a-tr.mp3'])
    byNode.typeData.scene.voice = { translation: false }
    byNode.typeData.scene.scene.options = { voice: { translation: true } }
    expect(nodeDownloads(byNode, []).map(i => i.url)).toEqual(['https://r2.dev/a.mp3'])
  })
})
