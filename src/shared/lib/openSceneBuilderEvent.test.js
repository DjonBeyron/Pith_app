import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  requestOpenSceneBuilder, peekSceneBuilderRequest, consumeSceneBuilderRequest, subscribeSceneBuilderRequest, onOpenSceneBuilder,
} from './openSceneBuilderEvent.js'
import { returnNotice, openSceneInSandbox } from '../../features/admin/scenes/feedTest/feedTestSandbox.js'
import { readSandbox, SANDBOX_KEY } from '../../features/feed/scene/sandbox/feedSandbox.js'
import { demoOfficeScene } from '../../features/scene/v2/demoScenes.js'

beforeEach(() => { vi.stubGlobal('window', new EventTarget()) })
afterEach(() => { vi.unstubAllGlobals(); const p = peekSceneBuilderRequest(); if (p) consumeSceneBuilderRequest(p.id) })

describe('pithy:open-scene-builder', () => {
  it('событие несёт полезную нагрузку { id, from, origin, scene }', () => {
    const got = []
    const off = onOpenSceneBuilder(d => got.push(d))
    const req = requestOpenSceneBuilder({ origin: 'node', scene: { id: 'x' } })
    off()
    expect(got).toEqual([req])
    expect(req).toMatchObject({ from: 'sandbox', origin: 'node', scene: { id: 'x' } })
    expect(requestOpenSceneBuilder().origin).toBe('admin')
  })
  it('запрос запоминается до тех пор, пока сборщик его не заберёт (вкладка «Сцены» может быть ещё не смонтирована)', () => {
    const fn = vi.fn()
    const off = subscribeSceneBuilderRequest(fn)
    const req = requestOpenSceneBuilder({})
    expect(peekSceneBuilderRequest()).toBe(req) // событие уже ушло, а запрос ждёт получателя
    consumeSceneBuilderRequest(req.id + 100) // чужой id не стирает
    expect(peekSceneBuilderRequest()).toBe(req)
    consumeSceneBuilderRequest(req.id)
    expect(peekSceneBuilderRequest()).toBeNull()
    expect(fn).toHaveBeenCalledTimes(2) // запрос + забрали
    off()
  })
  it('новый запрос заменяет старый (повторный клик не открывает окно дважды)', () => {
    const a = requestOpenSceneBuilder({})
    const b = requestOpenSceneBuilder({})
    expect(b.id).toBeGreaterThan(a.id)
    consumeSceneBuilderRequest(a.id)
    expect(peekSceneBuilderRequest()).toBe(b)
  })
})

describe('возврат в сборщик: черновик не теряется', () => {
  it('тест из обычного сборщика пишет origin в песочницу; из ноды/модуля — свой origin', () => {
    const store = new Map()
    vi.stubGlobal('sessionStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) })
    expect(openSceneInSandbox(demoOfficeScene, { force: false, open: false }).ok).toBe(true)
    expect(JSON.parse(store.get(SANDBOX_KEY)).origin).toBe('admin')
    expect(openSceneInSandbox(demoOfficeScene, { force: false, open: false, origin: 'module' }).ok).toBe(true)
    expect(readSandbox().origin).toBe('module')
    expect(readSandbox().scene.id).toBe(demoOfficeScene.id) // сцена теста лежит целиком — из неё открывается копия
  })
  it('пометка «открыто из теста»: для обычного сборщика — тот же черновик, для ноды/модуля — копия', () => {
    expect(returnNotice('admin')).toMatch(/тот же черновик/)
    expect(returnNotice('node')).toMatch(/копия/)
    expect(returnNotice('module')).toMatch(/Применить/)
  })
})
