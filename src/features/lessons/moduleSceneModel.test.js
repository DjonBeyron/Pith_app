import { describe, it, expect } from 'vitest'
import {
  publishedSceneRows, sceneLinkState, sceneLinkText, sceneLinkTone, mediaButtonMeta, moduleMediaChip, builderSavePayload,
} from './moduleSceneModel.js'

const rows = [
  { id: 'p1', title: 'Офис: кофе', status: 'published' },
  { id: 'd1', title: 'Офис черновик', status: 'draft' },
  { id: 'p2', title: 'Кафе', status: 'published' },
]

describe('publishedSceneRows', () => {
  it('только published, порядок сохранён', () => {
    expect(publishedSceneRows(rows).map(r => r.id)).toEqual(['p1', 'p2'])
  })
  it('поиск по названию без регистра', () => {
    expect(publishedSceneRows(rows, '  ОФИС').map(r => r.id)).toEqual(['p1'])
    expect(publishedSceneRows(rows, 'нет такого')).toEqual([])
  })
  it('не массив → пусто', () => {
    expect(publishedSceneRows(null)).toEqual([])
  })
})

describe('sceneLinkState', () => {
  it('нет sceneId → none (что бы ни пришло)', () => {
    expect(sceneLinkState({ sceneId: null, row: { status: 'published' }, loaded: true })).toBe('none')
  })
  it('ответ не пришёл → loading', () => {
    expect(sceneLinkState({ sceneId: 's', row: null, loaded: false })).toBe('loading')
  })
  it('ошибка → error (даже до loaded)', () => {
    expect(sceneLinkState({ sceneId: 's', row: null, error: new Error('x'), loaded: false })).toBe('error')
  })
  it('строки нет → deleted', () => {
    expect(sceneLinkState({ sceneId: 's', row: null, loaded: true })).toBe('deleted')
  })
  it('published / draft по статусу строки', () => {
    expect(sceneLinkState({ sceneId: 's', row: { status: 'published' }, loaded: true })).toBe('published')
    expect(sceneLinkState({ sceneId: 's', row: { status: 'draft' }, loaded: true })).toBe('draft')
  })
})

describe('sceneLinkText / sceneLinkTone', () => {
  it('черновик предупреждает, что лента покажет без сцены', () => {
    expect(sceneLinkText('draft')).toMatch(/ЧЕРНОВИК/)
    expect(sceneLinkText('draft')).toMatch(/без сцены/)
    expect(sceneLinkTone('draft')).toBe('warn')
  })
  it('удалена → bad, опубликована → ok, none → dim', () => {
    expect(sceneLinkTone('deleted')).toBe('bad')
    expect(sceneLinkText('deleted')).toMatch(/удалена/)
    expect(sceneLinkTone('published')).toBe('ok')
    expect(sceneLinkText('published')).toMatch(/вместо видео/)
    expect(sceneLinkTone('none')).toBe('dim')
  })
  it('error с сообщением дописывает его', () => {
    expect(sceneLinkText('error', new Error('сеть'))).toMatch(/сеть$/)
    expect(sceneLinkText('error')).toMatch(/Не удалось/)
  })
  it('неизвестное состояние → текст none', () => {
    expect(sceneLinkText('whatever')).toBe(sceneLinkText('none'))
  })
})

describe('mediaButtonMeta', () => {
  it('сцена → 🎭 и подсветка; видео остаётся запасным', () => {
    const m = mediaButtonMeta({ sceneId: 's', videoUrl: 'v' })
    expect(m).toMatchObject({ icon: '🎭', on: true })
    expect(m.title).toMatch(/запасным/)
  })
  it('только видео → 🎬 и подсветка', () => {
    expect(mediaButtonMeta({ videoUrl: 'v' })).toMatchObject({ icon: '🎬', on: true })
  })
  it('ничего → 🎬 без подсветки', () => {
    expect(mediaButtonMeta({})).toMatchObject({ icon: '🎬', on: false })
    expect(mediaButtonMeta()).toMatchObject({ icon: '🎬', on: false })
  })
})

describe('moduleMediaChip (метка в списке модулей)', () => {
  it('сцена важнее видео', () => {
    expect(moduleMediaChip({ scene_id: 's', video_url: 'v' })).toEqual({ text: '🎭 сцена', tone: 'ok' })
  })
  it('видео / ничего / нет колонки', () => {
    expect(moduleMediaChip({ video_url: 'v' })).toEqual({ text: 'видео есть', tone: 'ok' })
    expect(moduleMediaChip({ scene_id: null })).toEqual({ text: 'нет видео', tone: 'warn' })
    expect(moduleMediaChip({})).toEqual({ text: 'нет видео', tone: 'warn' })
  })
})

describe('builderSavePayload', () => {
  const scene = { version: 2, title: '  Кофе-брейк ', timeline: [] }
  it('новая сцена → без id, published, название из сцены', () => {
    expect(builderSavePayload(scene, null)).toEqual({ id: null, title: 'Кофе-брейк', scene, status: 'published' })
    expect(builderSavePayload(scene, { id: null })).toMatchObject({ id: null })
  })
  it('сцена из библиотеки → обновление той же строки', () => {
    expect(builderSavePayload(scene, { id: 'r1', status: 'draft' })).toMatchObject({ id: 'r1', status: 'published' })
  })
  it('пустое название → «Без названия», длинное — до 80 (CHECK)', () => {
    expect(builderSavePayload({ title: '   ' }).title).toBe('Без названия')
    expect(builderSavePayload({ title: 'x'.repeat(100) }).title).toHaveLength(80)
  })
})
