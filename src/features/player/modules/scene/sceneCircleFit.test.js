import { describe, it, expect } from 'vitest'
import { sceneCircleFit, CIRCLE_SHOW_W, CIRCLE_CENTER_Y, CIRCLE_SOLO, ringOffset } from './sceneCircleFit.js'
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

  it('мусорный диаметр → нули; ringOffset: idle пусто, ended полно', () => {
    expect(px(sceneCircleFit('x').width)).toBe(0)
    expect(ringOffset({ status: 'idle', index: 0, total: 3 }, 100)).toBe(100)
    expect(ringOffset({ status: 'ended', index: 2, total: 3 }, 100)).toBe(0)
    expect(ringOffset({ status: 'playing', index: 0, total: 2 }, 100)).toBe(75)
  })
})
