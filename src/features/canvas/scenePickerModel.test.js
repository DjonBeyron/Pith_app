import { describe, it, expect } from 'vitest'
import { filterSceneRows, pickRowPatch, applyBuilderPatch, builderInitialScene, clearScenePatch, sceneCheck, voiceLabel } from './scenePickerModel.js'
import { demoCafeScene, demoOfficeScene, demoTemplateScene } from '../scene/v2/demoScenes.js'

describe('scenePickerModel — пикер ноды scene', () => {
  const rows = [
    { id: '1', title: 'Кофе-брейк', scene: demoCafeScene },
    { id: '2', title: 'Про работу', scene: demoOfficeScene },
  ]

  it('поиск по названию и id без учёта регистра', () => {
    expect(filterSceneRows(rows, '').map(r => r.id)).toEqual(['1', '2'])
    expect(filterSceneRows(rows, 'кофе').map(r => r.id)).toEqual(['1'])
    expect(filterSceneRows(rows, 'OFFICE').map(r => r.id)).toEqual(['2'])
    expect(filterSceneRows(null, 'x')).toEqual([])
  })

  it('выбор строки — снимок + связь; строка без сцены — null', () => {
    const row = { ...rows[0], updated_at: '2026-10-14T10:00:00Z' }
    expect(pickRowPatch(row)).toEqual({ scene: demoCafeScene, sceneId: '1', sceneUpdatedAt: '2026-10-14T10:00:00Z' })
    expect(pickRowPatch({ id: 'x' })).toBeNull()
  })

  it('«Применить» из сборщика: правленая сцена отвязывается от библиотеки, неизменённая — остаётся привязанной', () => {
    const prev = { scene: demoCafeScene, sceneId: '1', sceneUpdatedAt: 't' }
    expect(applyBuilderPatch({ ...demoCafeScene, title: 'Другое' }, { prevTd: prev })).toEqual({ scene: { ...demoCafeScene, title: 'Другое' }, sceneId: null, sceneUpdatedAt: null })
    expect(applyBuilderPatch(JSON.parse(JSON.stringify(demoCafeScene)), { prevTd: prev })).toEqual({ scene: demoCafeScene })
    expect(applyBuilderPatch(demoCafeScene)).toMatchObject({ sceneId: null })
    expect(clearScenePatch()).toEqual({ scene: null, sceneId: null, sceneUpdatedAt: null })
  })

  it('сводка проверки: демо без ошибок; неизвестный предмет — ошибка; размер считается', () => {
    const ok = sceneCheck(demoCafeScene)
    expect(ok.errors).toEqual([])
    expect(ok.bytes).toBeGreaterThan(500)
    expect(ok.tooBig).toBe(false)
    expect(sceneCheck({ ...demoCafeScene, slots: { ...demoCafeScene.slots, table: 'rocket' } }).errors.some(e => e.includes('rocket'))).toBe(true)
    expect(sceneCheck(null)).toEqual({ errors: [], warns: [], bytes: 0, tooBig: false })
  })

  it('подпись озвучки', () => {
    expect(voiceLabel(demoCafeScene)).toBe('озвучка: браузерная')
    const tl = demoCafeScene.timeline.map((l, i) => (i === 0 ? { ...l, audioUrl: 'https://x/a.mp3' } : l))
    expect(voiceLabel({ timeline: tl })).toBe('озвучка: файлы у 1 из 5')
    expect(voiceLabel({ timeline: tl.map(l => ({ ...l, audioUrl: 'https://x/a.mp3' })) })).toBe('озвучка: файлы')
  })
})

describe('builderInitialScene — что открывает сборщик из ноды', () => {
  it('динамичная сцена отдаётся с vars (не подставленной копией)', () => {
    const preview = { ...demoTemplateScene, vars: undefined }
    expect(builderInitialScene(demoTemplateScene, preview, demoOfficeScene)).toBe(demoTemplateScene)
  })
  it('статичная — нормализованное превью; нет сцены — запасная', () => {
    expect(builderInitialScene(demoCafeScene, demoOfficeScene, null)).toBe(demoOfficeScene)
    expect(builderInitialScene({ broken: 1 }, null, demoOfficeScene)).toEqual({ broken: 1 })
    expect(builderInitialScene(null, null, demoOfficeScene)).toBe(demoOfficeScene)
  })
})
