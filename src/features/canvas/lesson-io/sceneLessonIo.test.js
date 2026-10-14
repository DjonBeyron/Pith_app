import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { lintLesson } from './lessonLint.js'
import { NODE_DOCS } from './lessonSchema.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const sceneNode = (td = {}) => ({
  id: 's', seq: 1, x: 0, y: 0, size: 'max', type: 'scene',
  typeData: { scene: { scene: demoCafeScene, sceneId: 'lib-1', sceneUpdatedAt: '2026-10-14T10:00:00Z', mode: 'circle', showBubbles: true, ...td } },
  triggers: [{ id: 't1', if: 'played', then: 't' }],
})
const textNode = { id: 't', seq: 2, x: 400, y: 0, size: 'max', type: 'text', typeData: { text: { content: 'Дальше' } }, triggers: [{ id: 't2', if: 'timer', ms: 2000, then: null }] }

describe('нода scene в формате обмена', () => {
  it('легенда описывает тип и его поля, needs нет', () => {
    expect(NODE_DOCS.scene.fields.scene).toContain('version')
    expect(NODE_DOCS.scene.fields.mode).toContain('circle')
    expect(NODE_DOCS.scene.needs).toBeUndefined()
  })

  it('экспорт: снимок сцены как есть (с id сцены, пустыми слотами, options), без needs', () => {
    const out = exportLesson([sceneNode(), textNode], { title: 'Сцена' })
    const n = out.nodes[0]
    expect(n.type).toBe('scene')
    expect(n.needs).toBeUndefined()
    expect(n.data.scene).toEqual(demoCafeScene)
    expect(n.data.scene.id).toBe('demo-cafe-break')
    expect(n.data.mode).toBe('circle')
    expect(n.data.sceneId).toBe('lib-1')
    expect(n.triggers[0]).toEqual({ if: 'played', then: 'n2' })
  })

  it('круглый цикл экспорт → импорт сохраняет сцену, режим и переход', () => {
    const out = exportLesson([sceneNode(), textNode], { title: 'Сцена' })
    const back = importLesson(JSON.stringify(out))
    const s = back.nodes.find(n => n.type === 'scene')
    expect(s.typeData.scene.scene).toEqual(demoCafeScene)
    expect(s.typeData.scene.mode).toBe('circle')
    expect(s.typeData.scene.showBubbles).toBe(true)
    expect(s.triggers[0].if).toBe('played')
    expect(s.triggers[0].then).toBe(back.nodes.find(n => n.type === 'text').id)
    expect(back.warnings.filter(w => w.includes('сцена'))).toEqual([])
    // второй круг — байт в байт
    expect(exportLesson(back.nodes, { title: 'Сцена' }).nodes[0].data.scene).toEqual(demoCafeScene)
  })

  it('импорт битого снимка не отвергает урок, но предупреждает', () => {
    const out = exportLesson([sceneNode({ scene: { ...demoCafeScene, version: 1 } }), textNode])
    const back = importLesson(out)
    expect(back.nodes).toHaveLength(2)
    expect(back.warnings.some(w => w.includes('формата v2'))).toBe(true)
  })
})

describe('lintLesson — нода scene', () => {
  const exch = (data, triggers = [{ if: 'played', then: 'n2' }]) => [
    { ref: 'n1', seq: 1, type: 'scene', data, triggers },
    { ref: 'n2', seq: 2, type: 'text', data: { content: 'Дальше' }, triggers: [] },
  ]

  it('хорошая сцена — ни одного замечания про сцену', () => {
    const w = lintLesson(exch({ scene: demoCafeScene, mode: 'bubble' }))
    expect(w.filter(x => x.includes('R-scene'))).toEqual([])
  })

  it('нет сцены — ошибка; кривой mode — ошибка', () => {
    const w = lintLesson(exch({ mode: 'fullscreen' }))
    expect(w.some(x => x.includes('[R-scene-missing]') && x.includes('ошибка'))).toBe(true)
    expect(w.some(x => x.includes('[R-scene-mode]'))).toBe(true)
  })

  it('невалидная сцена — ошибка из lintScene; предупреждение сцены — предупреждение урока', () => {
    const bad = { ...demoCafeScene, timeline: demoCafeScene.timeline.map(l => ({ ...l, emotion: 'happy', text: l.text.replace(/[.?!]$/, '') })), slots: { ...demoCafeScene.slots, table: 'rocket' } }
    const w = lintLesson(exch({ scene: bad }))
    expect(w.some(x => x.includes('[R-scene-invalid]') && x.includes('rocket'))).toBe(true)
    expect(w.some(x => x.includes('[R-scene-lint]') && x.includes('предупреждение'))).toBe(true)
  })

  it('снимок больше 64 КБ — ошибка размера', () => {
    const fat = { ...demoCafeScene, blob: 'a'.repeat(70 * 1024) }
    expect(lintLesson(exch({ scene: fat })).some(x => x.includes('[R-scene-size]'))).toBe(true)
  })

  it('played в никуда при других выходах — предупреждение; последняя нода без выходов — тишина', () => {
    const w = lintLesson(exch({ scene: demoCafeScene }, [{ if: 'played', then: null }, { if: 'timer', ms: 500, then: 'n2' }]))
    expect(w.some(x => x.includes('[R-scene-played]'))).toBe(true)
    const last = lintLesson([{ ref: 'n1', seq: 1, type: 'scene', data: { scene: demoCafeScene }, triggers: [{ if: 'played', then: null }] }])
    expect(last.filter(x => x.includes('R-scene'))).toEqual([])
  })
})
