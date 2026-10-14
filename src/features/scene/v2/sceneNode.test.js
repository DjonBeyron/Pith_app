import { describe, it, expect } from 'vitest'
import {
  resolveSceneNode, sceneByteSize, sceneAudioUrls, snapshotFromRow, libraryHasNewer, sceneSummary, rawSceneLines, SCENE_MAX_BYTES,
} from './sceneNode.js'
import { demoCafeScene } from './demoScenes.js'

describe('sceneNode — данные ноды scene', () => {
  it('валидный снимок → нормализованная сцена, режим и облачки по умолчанию', () => {
    const r = resolveSceneNode({ scene: demoCafeScene })
    expect(r.errors).toEqual([])
    expect(r.scene.version).toBe(2)
    expect(r.scene.timeline).toHaveLength(5)
    expect(r.mode).toBe('bubble')
    expect(r.showBubbles).toBe(true)
  })

  it('режим circle и showBubbles false читаются; мусорный режим → bubble', () => {
    expect(resolveSceneNode({ scene: demoCafeScene, mode: 'circle', showBubbles: false })).toMatchObject({ mode: 'circle', showBubbles: false })
    expect(resolveSceneNode({ scene: demoCafeScene, mode: 'fullscreen' }).mode).toBe('bubble')
  })

  it('нет сцены — scene null без ошибок (нода пустая)', () => {
    expect(resolveSceneNode({})).toMatchObject({ scene: null, errors: [] })
    expect(resolveSceneNode(null)).toMatchObject({ scene: null, errors: [] })
  })

  it('невалидная сцена → scene null и ошибки по-русски (версия, неизвестный предмет)', () => {
    const bad = { ...demoCafeScene, version: 1, slots: { ...demoCafeScene.slots, table: 'rocket' } }
    const r = resolveSceneNode({ scene: bad })
    expect(r.scene).toBeNull()
    expect(r.errors.some(e => e.startsWith('version'))).toBe(true)
    expect(r.errors.some(e => e.includes('rocket'))).toBe(true)
  })

  it('слишком большой снимок — ошибка размера', () => {
    const fat = { ...demoCafeScene, title: 'x', options: { ...demoCafeScene.options }, blob: 'a'.repeat(SCENE_MAX_BYTES) }
    expect(sceneByteSize(fat)).toBeGreaterThan(SCENE_MAX_BYTES)
    expect(resolveSceneNode({ scene: fat }).errors.some(e => e.includes('КБ'))).toBe(true)
  })

  it('sceneAudioUrls — уникальные audioUrl реплик', () => {
    const s = { timeline: [{ audioUrl: 'https://r2/a.mp3' }, { text: 'x' }, { audioUrl: 'https://r2/a.mp3' }, { audioUrl: 'https://r2/b.mp3' }] }
    expect(sceneAudioUrls(s)).toEqual(['https://r2/a.mp3', 'https://r2/b.mp3'])
    expect(sceneAudioUrls(demoCafeScene)).toEqual([])
  })

  it('снимок из строки библиотеки и проверка «есть новее»', () => {
    const row = { id: 'u1', title: 'Кофе', scene: demoCafeScene, updated_at: '2026-10-14T10:00:00Z' }
    const snap = snapshotFromRow(row)
    expect(snap).toEqual({ scene: demoCafeScene, sceneId: 'u1', sceneUpdatedAt: '2026-10-14T10:00:00Z' })
    expect(libraryHasNewer(snap, row)).toBe(false)
    expect(libraryHasNewer(snap, { ...row, updated_at: '2026-10-15T10:00:00Z' })).toBe(true)
    expect(libraryHasNewer({ scene: demoCafeScene }, row)).toBe(false) // без sceneId сравнивать нечего
    expect(libraryHasNewer(snap, { ...row, id: 'other' })).toBe(false)
  })

  it('сводка и реплики текстом для фолбэка', () => {
    expect(sceneSummary(resolveSceneNode({ scene: demoCafeScene }).scene)).toBe('Кофе-брейк · 5 реплик')
    expect(sceneSummary(null)).toBe('сцена не выбрана')
    const lines = rawSceneLines({ ...demoCafeScene, version: 1 })
    expect(lines).toHaveLength(5)
    expect(lines[0]).toMatchObject({ who: 'a', name: 'Мурка' })
    expect(rawSceneLines(null)).toEqual([])
  })
})
