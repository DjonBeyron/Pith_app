import { describe, it, expect } from 'vitest'
import { pickSlideMedia, sceneLayerMode, loopedScene, shouldScenePlay, sceneSound, sceneRate } from './slideSceneRules.js'
import { demoOfficeScene } from '../../scene/v2/demoScenes.js'

describe('slideSceneRules — выбор сцена/видео', () => {
  it('без sceneId — видео; сцена готова — сцена; нет/невалидна — видео; грузится — ждём постером', () => {
    expect(pickSlideMedia({ sceneId: null, status: 'ready' })).toBe('video')
    expect(pickSlideMedia({ sceneId: 's', status: 'ready' })).toBe('scene')
    expect(pickSlideMedia({ sceneId: 's', status: 'missing' })).toBe('video')
    expect(pickSlideMedia({ sceneId: 's', status: 'invalid' })).toBe('video')
    expect(pickSlideMedia({ sceneId: 's', status: 'loading' })).toBe('wait')
    expect(pickSlideMedia({ sceneId: 's', status: 'idle' })).toBe('wait')
  })
})

describe('slideSceneRules — окно ленты', () => {
  it('активный → live, сосед → static, далёкий → скелетон; perfFlags.noVideo → активный тоже static', () => {
    expect(sceneLayerMode({ active: true, near: true })).toBe('live')
    expect(sceneLayerMode({ active: false, near: true })).toBe('static')
    expect(sceneLayerMode({ active: false, near: false })).toBe('skeleton')
    expect(sceneLayerMode({ active: true, near: true, noVideo: true })).toBe('static')
    expect(sceneLayerMode({ active: false, near: true, noVideo: true })).toBe('static')
  })
})

describe('slideSceneRules — пауза, звук, loop, замедление', () => {
  it('играть можно только живой, видимой и не на паузе', () => {
    expect(shouldScenePlay({ live: true, paused: false, tabVisible: true })).toBe(true)
    expect(shouldScenePlay({ live: true, paused: true, tabVisible: true })).toBe(false)
    expect(shouldScenePlay({ live: true, paused: false, tabVisible: false })).toBe(false)
    expect(shouldScenePlay({ live: false, paused: false })).toBe(false)
  })

  it('сцена в ленте зациклена независимо от options сцены; исходный объект не меняется', () => {
    const looped = loopedScene(demoOfficeScene)
    expect(looped.options.loop).toBe(true)
    expect(looped.options.bubbles).toBe(true)
    expect(demoOfficeScene.options.loop).toBe(false)
    expect(loopedScene(null)).toBeNull()
    expect(loopedScene({ version: 2 }).options).toEqual({ loop: true })
  })

  it('без звука ленты сцена молчит (таймер + рот + облачки), со звуком — голос; 0.5x → rate 0.5', () => {
    expect(sceneSound(false)).toBe(false)
    expect(sceneSound(true)).toBe(true)
    expect(sceneSound(undefined)).toBe(false)
    expect(sceneRate(true)).toBe(0.5)
    expect(sceneRate(false)).toBe(1)
  })
})
