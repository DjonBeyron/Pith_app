import { describe, it, expect } from 'vitest'
import {
  normalizeSceneCrop, isDefaultCrop, checkSceneCrop, SCENE_CROP_DEFAULT, SCENE_CROP_LIMITS, SCENE_CROP_REF_W,
} from './sceneNodeCrop.js'
import { sceneBubbleCropStyle, SCENE_CROP_REF_H } from './sceneCropStyle.js'
import { resolveSceneNode } from './sceneNode.js'
import { demoCafeScene } from './demoScenes.js'

describe('crop ноды сцены: формат как у видео { x, y, scale }', () => {
  it('нет поля / мусор → { 0, 0, 1 } (старые ноды не меняются)', () => {
    for (const raw of [undefined, null, 'x', 5, [], {}, { x: 'a', y: NaN, scale: 0 }]) {
      expect(normalizeSceneCrop(raw)).toEqual(SCENE_CROP_DEFAULT)
    }
    expect(isDefaultCrop(undefined)).toBe(true)
    expect(isDefaultCrop({ x: 0.04, y: 0, scale: 1 })).toBe(true) // округление до 0.1 px
    expect(isDefaultCrop({ x: 0, y: 0, scale: 1.2 })).toBe(false)
  })

  it('значения зажимаются в диапазон; строки-числа принимаются', () => {
    const { scaleMin, scaleMax, shiftMax } = SCENE_CROP_LIMITS
    expect(normalizeSceneCrop({ x: 9999, y: -9999, scale: 99 })).toEqual({ x: shiftMax, y: -shiftMax, scale: scaleMax })
    expect(normalizeSceneCrop({ scale: 0.01 }).scale).toBe(scaleMin)
    expect(normalizeSceneCrop({ x: '12.34', y: '-5', scale: '1.5' })).toEqual({ x: 12.3, y: -5, scale: 1.5 })
  })

  it('линтер урока: допустимое молчит; лишнее поле, не число, вне диапазона — ошибки', () => {
    expect(checkSceneCrop(undefined)).toEqual([])
    expect(checkSceneCrop({ x: 10, y: -20, scale: 2 })).toEqual([])
    expect(checkSceneCrop({ scale: 1 })).toEqual([])
    expect(checkSceneCrop('big')).toHaveLength(1)
    expect(checkSceneCrop({ scale: 9 })[0]).toContain('crop.scale')
    expect(checkSceneCrop({ scale: 0.1 })[0]).toContain('crop.scale')
    expect(checkSceneCrop({ x: 1000 })[0]).toContain('crop.x')
    expect(checkSceneCrop({ y: 'a' })[0]).toContain('crop.y')
    expect(checkSceneCrop({ zoom: 2 })[0]).toContain('crop.zoom')
  })

  it('resolveSceneNode: crop нормализуется, без поля — умолчание, и для circle, и для bubble', () => {
    expect(resolveSceneNode({ scene: demoCafeScene }).crop).toEqual(SCENE_CROP_DEFAULT)
    expect(resolveSceneNode({ scene: demoCafeScene, mode: 'circle', crop: { x: 5, scale: 2 } }).crop).toEqual({ x: 5, y: 0, scale: 2 })
    expect(resolveSceneNode({ crop: { scale: 99 } }).crop.scale).toBe(SCENE_CROP_LIMITS.scaleMax)
  })
})

describe('sceneBubbleCropStyle — масштаб/сдвиг пузыря и полного экрана', () => {
  it('умолчание → undefined (слоя нет, DOM как у старых нод)', () => {
    expect(sceneBubbleCropStyle(undefined)).toBeUndefined()
    expect(sceneBubbleCropStyle({ x: 0, y: 0, scale: 1 })).toBeUndefined()
  })

  it('сдвиг в процентах СВОЕЙ рамки: 200 px по x = 100 % ширины; y — от высоты кадра 200·16/9', () => {
    const st = sceneBubbleCropStyle({ x: 20, y: 0, scale: 1.5 })
    expect(st.transform).toBe('translate(10%, 0%) scale(1.5)')
    expect(st.position).toBe('absolute')
    expect(st.transformOrigin).toBe('center center')
    const y = sceneBubbleCropStyle({ x: 0, y: 50, scale: 1 })
    expect(parseFloat(y.transform.match(/translate\(0%, ([\d.]+)%\)/)[1])).toBeCloseTo(50 / SCENE_CROP_REF_H * 100, 2)
    expect(SCENE_CROP_REF_W).toBe(200)
  })
})
