import { describe, it, expect, vi, beforeEach } from 'vitest'
import { editRequest, applySceneToNode, addSceneNode, runRowAction } from './sceneTabOps.js'
import { fixtureNodes } from './sceneTabFixtures.js'
import { useCanvasNodeOps } from '../useCanvasNodeOps.js'
import { demoOfficeScene, demoTemplateScene } from '../../scene/v2/demoScenes.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
})

// Поддельный boardApi поверх массива нод: patchNodeTypeData как в useCanvasBoardApi
function fakeApi(initial) {
  let nodes = initial
  const api = {
    getNodes: () => nodes,
    focusNode: vi.fn(), duplicateNode: vi.fn(), deleteNode: vi.fn(),
    addNode: vi.fn(() => 'new-id'),
    patchNodeTypeData(id, fn) {
      nodes = nodes.map(n => (n.id === id ? { ...n, typeData: { ...n.typeData, [n.type]: fn(n.typeData[n.type], n) } } : n))
    },
  }
  return api
}

describe('открытие сборщика из строки', () => {
  it('отдаёт снимок сцены ноды; динамичной — вкладку «Настройки», статичной — «Сцена»', () => {
    const api = fakeApi(fixtureNodes())
    expect(editRequest(api, 'n2')).toEqual({ id: 'n2', scene: demoOfficeScene, view: 'scene' })
    const dyn = editRequest(api, 'n3')
    expect(dyn.view).toBe('settings')
    expect(dyn.scene.vars).toEqual(demoTemplateScene.vars) // vars не потеряны (не подставленная копия)
    expect(editRequest(api, 't1')).toBeNull()
    expect(editRequest(api, 'нет-такой')).toBeNull()
  })
})

describe('запись результата сборщика в ноду', () => {
  it('«Применить» заменяет снимок, сбрасывает связь с библиотекой, не трогает настройки ноды', () => {
    const nodes = fixtureNodes()
    nodes[2].typeData.scene.sceneId = 'lib-1'
    const api = fakeApi(nodes)
    applySceneToNode(api, 'n2', { ...demoOfficeScene, title: 'Новое название' })
    const td = api.getNodes()[2].typeData.scene
    expect(td.scene.title).toBe('Новое название')
    expect(td.sceneId).toBeNull()
    expect(td.mode).toBe('bubble')
    expect(td.start).toBe('auto')
  })

  it('сцена не менялась — связь с библиотекой остаётся', () => {
    const nodes = fixtureNodes()
    nodes[2].typeData.scene.sceneId = 'lib-1'
    const api = fakeApi(nodes)
    applySceneToNode(api, 'n2', nodes[2].typeData.scene.scene)
    expect(api.getNodes()[2].typeData.scene.sceneId).toBe('lib-1')
  })

  it('закрытие без «Применить» (нет сцены/id) — ничего не пишется', () => {
    const api = fakeApi(fixtureNodes())
    const before = api.getNodes()
    applySceneToNode(api, 'n2', null)
    applySceneToNode(api, null, demoOfficeScene)
    expect(api.getNodes()).toBe(before)
  })
})

describe('обработчики строки вызывают нужные колбэки', () => {
  it('edit / go / play / dup / del', () => {
    const api = fakeApi(fixtureNodes())
    const ctx = { onClose: vi.fn(), onPlayFrom: vi.fn() }
    const setEditing = vi.fn()
    const run = (k, id) => runRowAction(k, api, id, ctx, setEditing)
    run('edit', 'n1'); expect(setEditing).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }))
    run('go', 'n1'); expect(ctx.onClose).toHaveBeenCalledTimes(1); expect(api.focusNode).toHaveBeenCalledWith('n1')
    run('play', 'n3'); expect(ctx.onPlayFrom).toHaveBeenCalledWith('n3'); expect(ctx.onClose).toHaveBeenCalledTimes(2)
    run('dup', 'n2'); expect(api.duplicateNode).toHaveBeenCalledWith('n2')
    run('del', 'n4'); expect(api.deleteNode).toHaveBeenCalledWith('n4')
  })

  it('без boardApi (холст не готов) ничего не падает', () => {
    const ctx = { onClose: vi.fn() }
    expect(() => { for (const k of ['edit', 'go', 'play', 'dup', 'del']) runRowAction(k, null, 'x', ctx, vi.fn()) }).not.toThrow()
    expect(addSceneNode(null, {})).toBeNull()
  })
})

describe('добавление сцены в урок', () => {
  it('addSceneNode передаёт тип scene и заготовку typeData, возвращает id', () => {
    const api = fakeApi([])
    expect(addSceneNode(api, { scene: demoOfficeScene })).toBe('new-id')
    expect(api.addNode).toHaveBeenCalledWith(null, 'scene', { scene: demoOfficeScene })
  })

  it('insertAfterNode с extra: нода с заданным id и сценой, встроена в цепочку после оригинала', () => {
    let nodes = [{ id: 'a', seq: 1, x: 0, y: 0, size: 'max', type: 'text', typeData: { text: { content: '' } }, triggers: [{ id: 't', if: 'played', then: null }] }]
    const ops = useCanvasNodeOps(fn => { nodes = typeof fn === 'function' ? fn(nodes) : fn })
    ops.insertAfterNode('a', 'scene', { id: 'S1', td: { scene: demoOfficeScene, mode: 'bubble' } })
    const s = nodes.find(n => n.id === 'S1')
    expect(s.type).toBe('scene')
    expect(s.seq).toBe(2)
    expect(s.typeData.scene.scene).toBe(demoOfficeScene)
    expect(s.typeData.scene.start).toBe('auto') // остальные поля — умолчания makeNode
    expect(nodes.find(n => n.id === 'a').triggers[0].then).toBe('S1')
  })
})
