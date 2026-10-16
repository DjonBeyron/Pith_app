import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { lintLesson as lintLessonRaw } from './lessonLint.js'
import { demoTemplateScene } from '../../scene/v2/demoScenes.js'
import { resolveSceneNode } from '../../scene/v2/sceneNode.js'

// Нода scene с шаблоном (vars + плейсхолдеры + segments): экспорт/импорт без потерь, линтер урока не падает,
// плеер (resolveSceneNode) получает сцену со словами-запасными
const lintLesson = nodes => lintLessonRaw(nodes, { title: 'Старт' })

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const withSegments = () => {
  const s = JSON.parse(JSON.stringify(demoTemplateScene))
  s.timeline[0].segments = [{ text: 'Can I have ' }, { var: 'food' }, { text: ', please?' }]
  return s
}
const sceneNode = scene => ({
  id: 's', seq: 1, x: 0, y: 0, size: 'max', type: 'scene',
  typeData: { scene: { scene, mode: 'circle', showBubbles: true } },
  triggers: [{ id: 't1', if: 'played', then: 't' }],
})
const textNode = { id: 't', seq: 2, x: 400, y: 0, size: 'max', type: 'text', typeData: { text: { content: 'Дальше' } }, triggers: [{ id: 't2', if: 'timer', ms: 2000, then: null }] }

describe('нода scene со словами-переменными', () => {
  it('экспорт → импорт: vars, плейсхолдеры и segments без потерь', () => {
    const scene = withSegments()
    const out = exportLesson([sceneNode(scene), textNode], { title: 'Сцена' })
    expect(out.nodes[0].data.scene).toEqual(scene)
    const back = importLesson(JSON.stringify(out))
    const s = back.nodes.find(n => n.type === 'scene').typeData.scene.scene
    expect(s).toEqual(scene)
    expect(s.vars.food.fallback).toEqual({ text: 'a sandwich', translation: 'бутерброд' })
    expect(s.timeline[1].translation).toContain('{food:ru}')
  })
  it('импорт предупреждает о шаблоне с битыми vars (сцену не теряет)', () => {
    const scene = { ...withSegments(), vars: { food: { pick: 'weak' } } }
    const out = exportLesson([sceneNode(scene), textNode], { title: 'Сцена' })
    const back = importLesson(JSON.stringify(out))
    expect(back.warnings.some(w => w.includes('vars.food.fallback'))).toBe(true)
    expect(back.nodes[0].typeData.scene.scene.vars.food.pick).toBe('weak')
  })
  it('линтер урока: шаблон без ошибок и без падений на vars/segments', () => {
    const out = exportLesson([sceneNode(withSegments()), textNode], { title: 'Сцена' })
    const msgs = lintLesson(out.nodes)
    expect(msgs.filter(m => /scene.*ошибка/.test(m))).toEqual([])
  })
  it('плеер получает сцену со словами-запасными', () => {
    const r = resolveSceneNode({ scene: withSegments() })
    expect(r.scene.timeline[0].text).toBe('Can I have a sandwich, please?')
    expect(r.scene.timeline[0].segments).toBeUndefined()
  })
})
