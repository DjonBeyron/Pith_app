import { describe, it, expect } from 'vitest'
import {
  normalizeFeedFrame, validateFeedFrame, isDefaultFeedFrame, resolveFeedFrame, FEED_FRAME_LIMITS,
} from './sceneFeedFrame.js'
import { normalizeSceneOptions, validateSceneOptions } from './sceneOptions.js'
import { normalizeSceneV2, validateSceneV2 } from './sceneSchemaV2.js'
import { demoOfficeScene } from './demoScenes.js'

const errs = v => { const e = []; validateFeedFrame(v, e); return e }

describe('options.feedFrame — нормализация и валидация', () => {
  it('нет поля / не объект → null; пустой объект → умолчания', () => {
    expect(normalizeFeedFrame(undefined)).toBeNull()
    expect(normalizeFeedFrame('x')).toBeNull()
    expect(normalizeFeedFrame([])).toBeNull()
    expect(normalizeFeedFrame({})).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('диапазоны зажимаются: scale 0.6…1.6, x/y −1…1; мусор → умолчание; anchor — только из списка', () => {
    expect(normalizeFeedFrame({ scale: 9, x: -5, y: 5 })).toEqual({ scale: FEED_FRAME_LIMITS.scaleMax, x: -1, y: 1 })
    expect(normalizeFeedFrame({ scale: 0.1 }).scale).toBe(0.6)
    expect(normalizeFeedFrame({ scale: 'big', x: NaN, y: Infinity })).toEqual({ scale: 1, x: 0, y: 0 })
    expect(normalizeFeedFrame({ anchor: 'center' }).anchor).toBe('center')
    expect(normalizeFeedFrame({ anchor: 'middle' }).anchor).toBeUndefined()
    expect(normalizeFeedFrame({ scale: 1.23456 }).scale).toBe(1.235)
  })

  it('валидация: русские ошибки с путём options.feedFrame.*; выход за диапазон — не ошибка', () => {
    expect(errs({ scale: 1.2, x: 0.1, y: -0.2, anchor: 'top' })).toEqual([])
    expect(errs({ scale: 99 })).toEqual([])
    expect(errs('x')).toEqual(['options.feedFrame — объект { scale, x, y, anchor? }'])
    expect(errs({ scale: '1' })).toEqual(['options.feedFrame.scale — число'])
    expect(errs({ x: null })).toEqual(['options.feedFrame.x — число'])
    expect(errs({ anchor: 'left' })[0]).toMatch(/^options\.feedFrame\.anchor — top \| center \| bottom$/)
    expect(errs({ zoom: 1 })).toEqual(['options.feedFrame.zoom — лишнее поле (scale, x, y, anchor)'])
  })

  it('кадр по умолчанию: isDefault и resolve', () => {
    expect(isDefaultFeedFrame(undefined)).toBe(true)
    expect(isDefaultFeedFrame({ scale: 1, x: 0, y: 0 })).toBe(true)
    expect(isDefaultFeedFrame({ anchor: 'bottom' })).toBe(true)
    expect(isDefaultFeedFrame({ scale: 1.1 })).toBe(false)
    expect(isDefaultFeedFrame({ anchor: 'top' })).toBe(false)
    expect(resolveFeedFrame(undefined)).toEqual({ scale: 1, x: 0, y: 0, anchor: 'bottom' })
    expect(resolveFeedFrame({ feedFrame: { x: 0.3, anchor: 'center' } })).toEqual({ scale: 1, x: 0.3, y: 0, anchor: 'center' })
  })
})

describe('options.feedFrame в сцене v2: старые сцены не меняются', () => {
  it('нормализация options: поля нет → его нет; есть → полный кадр', () => {
    expect(normalizeSceneOptions({ bubbles: true }).feedFrame).toBeUndefined()
    expect('feedFrame' in normalizeSceneOptions(undefined)).toBe(false)
    expect(normalizeSceneOptions({ feedFrame: { scale: 2 } }).feedFrame).toEqual({ scale: 1.6, x: 0, y: 0 })
  })

  it('validateSceneOptions: feedFrame — объект, а не true/false; неизвестные ключи по-прежнему boolean', () => {
    const e = []
    validateSceneOptions({ bubbles: true, feedFrame: { scale: 1 } }, e)
    expect(e).toEqual([])
    validateSceneOptions({ feedFrame: true, extra: 1 }, e)
    expect(e).toEqual(['options.feedFrame — объект { scale, x, y, anchor? }', 'options.extra — true/false'])
  })

  it('демо-сцена без feedFrame валидна и после нормализации без поля; с полем — валидна', () => {
    expect(validateSceneV2(demoOfficeScene)).toEqual([])
    expect(normalizeSceneV2(demoOfficeScene).options.feedFrame).toBeUndefined()
    const withFrame = { ...demoOfficeScene, options: { ...demoOfficeScene.options, feedFrame: { scale: 1.2, y: 0.1, anchor: 'center' } } }
    expect(validateSceneV2(withFrame)).toEqual([])
    expect(normalizeSceneV2(withFrame).options.feedFrame).toEqual({ scale: 1.2, x: 0, y: 0.1, anchor: 'center' })
    const bad = { ...demoOfficeScene, options: { ...demoOfficeScene.options, feedFrame: { scale: 'a' } } }
    expect(validateSceneV2(bad)).toContain('options.feedFrame.scale — число')
  })
})
