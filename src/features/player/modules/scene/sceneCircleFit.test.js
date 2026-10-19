import { describe, it, expect } from 'vitest'
import { sceneCircleFit, CIRCLE_SHOW_W, CIRCLE_CENTER_Y, CIRCLE_SOLO } from './sceneCircleFit.js'
import { SCENE_W, SCENE_H } from '../../../scene/v2/sprites/backgrounds.js'

// Кадрирование сцены в кружок: две головы (по умолчанию) и одна голова одиночной сцены по центру
const px = v => parseFloat(v)

describe('sceneCircleFit', () => {
  it('по умолчанию: полоса CIRCLE_SHOW_W единиц, центр CIRCLE_CENTER_Y в центре круга', () => {
    const d = 200
    const st = sceneCircleFit(d)
    expect(px(st.width)).toBeCloseTo(d * SCENE_W / CIRCLE_SHOW_W, 1)
    expect(px(st.height)).toBeCloseTo(px(st.width) * SCENE_H / SCENE_W, 1)
    // центр по x: left + width/2 = d/2
    expect(px(st.left) + px(st.width) / 2).toBeCloseTo(d / 2, 1)
    // точка centerY сцены — в центре круга
    expect(px(st.top) + CIRCLE_CENTER_Y / SCENE_H * px(st.height)).toBeCloseTo(d / 2, 1)
  })

  it('solo: кадр ближе (CIRCLE_SOLO.showW < CIRCLE_SHOW_W), голова одиночного кота (x 180) в центре круга', () => {
    const d = 200
    const st = sceneCircleFit(d, { solo: true })
    expect(CIRCLE_SOLO.showW).toBeLessThan(CIRCLE_SHOW_W)
    expect(px(st.width)).toBeCloseTo(d * SCENE_W / CIRCLE_SOLO.showW, 1)
    expect(px(st.width)).toBeGreaterThan(px(sceneCircleFit(d).width))
    expect(px(st.left) + 180 / SCENE_W * px(st.width)).toBeCloseTo(d / 2, 1)
    expect(px(st.top) + CIRCLE_SOLO.centerY / SCENE_H * px(st.height)).toBeCloseTo(d / 2, 1)
    // голова Пита (y ≈ 480…540 во вьюбоксе) целиком в круге: верх и низ головы внутри диаметра
    const yPx = v => px(st.top) + v / SCENE_H * px(st.height)
    expect(yPx(480)).toBeGreaterThan(0)
    expect(yPx(540)).toBeLessThan(d)
  })

  it('мусорный диаметр → нули', () => {
    expect(px(sceneCircleFit('x').width)).toBe(0)
  })

  it('crop по умолчанию (и мусор) не меняет кадр — старые ноды как раньше', () => {
    const base = sceneCircleFit(200)
    expect(sceneCircleFit(200, { crop: { x: 0, y: 0, scale: 1 } })).toEqual(base)
    expect(sceneCircleFit(200, { crop: 'junk' })).toEqual(base)
    expect(sceneCircleFit(200, { solo: true, crop: null })).toEqual(sceneCircleFit(200, { solo: true }))
  })

  it('crop.scale увеличивает содержимое вокруг центра круга: опорная точка кадра остаётся в центре', () => {
    const d = 200
    for (const solo of [false, true]) {
      const cy = solo ? CIRCLE_SOLO.centerY : CIRCLE_CENTER_Y
      const st = sceneCircleFit(d, { solo, crop: { x: 0, y: 0, scale: 2 } })
      const base = sceneCircleFit(d, { solo })
      expect(px(st.width)).toBeCloseTo(px(base.width) * 2, 1)
      expect(px(st.left) + px(st.width) / 2).toBeCloseTo(d / 2, 1)
      expect(px(st.top) + cy / SCENE_H * px(st.height)).toBeCloseTo(d / 2, 1)
    }
  })

  it('crop.x/y — сдвиг в px круга диаметром 200: на другом диаметре пропорционально', () => {
    const crop = { x: 20, y: -10, scale: 1 }
    for (const d of [200, 150, 300]) {
      const a = sceneCircleFit(d), b = sceneCircleFit(d, { crop })
      expect(px(b.left) - px(a.left)).toBeCloseTo(20 * d / 200, 1)
      expect(px(b.top) - px(a.top)).toBeCloseTo(-10 * d / 200, 1)
      expect(px(b.width)).toBe(px(a.width))
    }
    // как у видео: scale и сдвиг независимы — сдвиг не масштабируется вместе с содержимым
    const s2 = sceneCircleFit(200, { crop: { x: 20, y: 0, scale: 2 } })
    const s2n = sceneCircleFit(200, { crop: { x: 0, y: 0, scale: 2 } })
    expect(px(s2.left) - px(s2n.left)).toBeCloseTo(20, 1)
  })

  it('crop вне диапазона зажимается (scale 0.5…4)', () => {
    expect(px(sceneCircleFit(200, { crop: { scale: 99 } }).width)).toBeCloseTo(px(sceneCircleFit(200, { crop: { scale: 4 } }).width), 1)
    expect(px(sceneCircleFit(200, { crop: { scale: 0.01 } }).width)).toBeCloseTo(px(sceneCircleFit(200).width) * 0.5, 1)
  })
})

describe('кружок Пита: кот в 3 раза крупнее прежнего кадра и без облачка', () => {
  it('solo: показывается полоса 107 ед. (было 320) — кот шириной ≈104 ед. почти во всю ширину круга', () => {
    expect(CIRCLE_SOLO.showW).toBeCloseTo(320 / 3, 0)
    const st = sceneCircleFit(300, { solo: true })
    expect(parseFloat(st.width)).toBeCloseTo(300 * SCENE_W / CIRCLE_SOLO.showW, 0)
    expect(104 / CIRCLE_SOLO.showW).toBeGreaterThan(0.9)
  })
  it('crop.scale 0.75 (средний план) всё равно в 3 раза крупнее прежнего кадра с crop 0.75', () => {
    const was = 300 * SCENE_W / 320 * 0.75
    expect(parseFloat(sceneCircleFit(300, { solo: true, crop: { x: 0, y: 0, scale: 0.75 } }).width)).toBeCloseTo(was * 3, 0)
  })
})
