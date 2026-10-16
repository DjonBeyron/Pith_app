import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { lintLesson as lintLessonRaw } from './lessonLint.js'
import { NODE_DOCS } from './lessonSchema.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'
import { resolveSceneNode } from '../../scene/v2/sceneNode.js'

// crop ноды scene (масштаб/сдвиг как у видео) в формате обмена: экспорт/импорт без потерь, линтер, легенда
const lintLesson = nodes => lintLessonRaw(nodes, { title: 'Старт' })

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
  typeData: { scene: { scene: demoCafeScene, mode: 'circle', showBubbles: true, ...td } },
  triggers: [{ id: 't1', if: 'played', then: 't' }],
})
const textNode = { id: 't', seq: 2, x: 400, y: 0, size: 'max', type: 'text', typeData: { text: { content: 'Дальше' } }, triggers: [{ id: 't2', if: 'timer', ms: 2000, then: null }] }
const exch = data => [
  { ref: 'n1', seq: 1, type: 'scene', data, triggers: [{ if: 'played', then: 'n2' }] },
  { ref: 'n2', seq: 2, type: 'text', data: { content: 'Дальше' }, triggers: [] },
]

describe('crop ноды scene в уроке', () => {
  it('легенда описывает поле crop', () => {
    expect(NODE_DOCS.scene.fields.crop).toContain('scale')
    expect(NODE_DOCS.scene.fields.crop).toContain('как у видео')
  })

  it('экспорт → импорт: crop (circle и bubble) сохраняется без потерь, resolveSceneNode видит то же', () => {
    for (const mode of ['circle', 'bubble']) {
      const crop = { x: -12.5, y: 30, scale: 1.75 }
      const out = exportLesson([sceneNode({ mode, crop }), textNode], { title: 'Сцена' })
      expect(out.nodes[0].data.crop).toEqual(crop)
      const back = importLesson(JSON.stringify(out))
      const s = back.nodes.find(n => n.type === 'scene')
      expect(s.typeData.scene.crop).toEqual(crop)
      expect(resolveSceneNode(s.typeData.scene).crop).toEqual(crop)
      expect(exportLesson(back.nodes, { title: 'Сцена' }).nodes[0].data.crop).toEqual(crop)
    }
  })

  it('старая нода без crop: в экспорт поле не попадает, после импорта умолчание { 0, 0, 1 }', () => {
    const out = exportLesson([sceneNode(), textNode], { title: 'Сцена' })
    expect('crop' in out.nodes[0].data).toBe(false)
    const s = importLesson(JSON.stringify(out)).nodes.find(n => n.type === 'scene')
    expect(resolveSceneNode(s.typeData.scene).crop).toEqual({ x: 0, y: 0, scale: 1 })
  })

  it('кроп, сброшенный редактором (undefined), не пишется', () => {
    const out = exportLesson([sceneNode({ crop: undefined }), textNode], { title: 'Сцена' })
    expect('crop' in out.nodes[0].data).toBe(false)
  })

  it('линтер: нормальный crop молчит; scale/x/y вне диапазона и лишние поля — [R-scene-crop]', () => {
    expect(lintLesson(exch({ scene: demoCafeScene, crop: { x: 10, y: -10, scale: 2 } })).filter(x => x.includes('R-scene'))).toEqual([])
    const bad = lintLesson(exch({ scene: demoCafeScene, crop: { x: 9000, scale: 0.1, zoom: 3 } }))
    expect(bad.filter(x => x.includes('[R-scene-crop]'))).toHaveLength(3)
    expect(bad.some(x => x.includes('[R-scene-crop]') && x.includes('ошибка'))).toBe(true)
    expect(lintLesson(exch({ scene: demoCafeScene, crop: 'big' })).some(x => x.includes('[R-scene-crop]'))).toBe(true)
  })
})
