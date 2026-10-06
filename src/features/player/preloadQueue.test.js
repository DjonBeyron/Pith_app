import { describe, it, expect } from 'vitest'
import { warmupPlan, nodeFileKey } from './preloadQueue.js'

const node = (id, then = null, type = 'audio') => ({ id, type, typeData: { [type]: { r2Url: `https://x/${id}.mp3` } }, triggers: then ? [{ if: 'played', then }] : [] })
// Линейный урок a→b→c→d→e, медиа в каждой ноде; BFS-индексы 0..4
const nodes = [node('a', 'b'), node('b', 'c'), node('c', 'd'), node('d', 'e'), node('e')]
const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
const queue = nodes.map((n, i) => ({ id: n.id, nodeId: n.id, nodeIdx: i, nodeType: 'audio' }))

describe('warmupPlan', () => {
  it('без точки входа — первые lookahead нод по BFS, гейт = lookahead', () => {
    const p = warmupPlan(queue, null, byId, 2)
    expect(p.warmupIds).toEqual(['a', 'b'])
    expect(p.allowUpTo).toBe(2)
    expect(p.queue).toBe(queue)
  })

  it('с точкой «Продолжить» — достижимое от неё вперёд, прогрев по пути, гейт поднят', () => {
    const p = warmupPlan(queue, 'd', byId, 2)
    expect(p.queue.map(i => i.id)).toEqual(['d', 'e', 'a', 'b', 'c']) // по близости к точке входа, потом остальное
    expect(p.warmupIds).toEqual(['d', 'e'])
    expect(p.allowUpTo).toBe(5) // max nodeIdx (4) + 1 — иначе pump не пустил бы d/e
  })

  it('неизвестная точка входа — как без неё', () => {
    expect(warmupPlan(queue, 'zzz', byId, 3).warmupIds).toEqual(['a', 'b', 'c'])
  })
})

describe('nodeFileKey', () => {
  it('file_id, иначе r2Url, иначе null', () => {
    expect(nodeFileKey({ type: 'audio', typeData: { audio: { file_id: 'f1', r2Url: 'https://x/1.mp3' } } })).toBe('f1')
    expect(nodeFileKey({ type: 'audio', typeData: { audio: { r2Url: 'https://x/1.mp3' } } })).toBe('https://x/1.mp3')
    expect(nodeFileKey({ type: 'text', typeData: { text: {} } })).toBe(null)
  })
})
