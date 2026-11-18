import { describe, it, expect, vi } from 'vitest'
import { danceFrames, eyeFrames, edgeXs, canDance, startNoteDance, DANCE_STEP_MS, DANCE_HOME_MS, EYES_OPEN_MS, EYES_SHUT, MOVE_SHARE } from './raceNoteDance.js'

// v3.3.283: «танец» Пита на трёх нотах — вправо, влево, вправо в углы экрана, плавно и с остановками, назад на место; мимика — только закрытые глаза; в коробке — не нужно
describe('кадры танца', () => {
  const px = f => parseFloat(f.translate)
  it('из центра: размахи вправо / влево / вправо до углов (голова упирается в край), с остановками в углах; в конце — на месте; смещения симметричны', () => {
    const { frames, duration } = danceFrames({ x0: 50, headW: 50, stageW: 400 })
    expect(duration).toBe(DANCE_STEP_MS * 3 + DANCE_HOME_MS)
    const move = DANCE_STEP_MS * MOVE_SHARE
    expect(frames.map(f => Math.round(f.offset * duration))).toEqual([0, move, DANCE_STEP_MS, DANCE_STEP_MS + move, DANCE_STEP_MS * 2, DANCE_STEP_MS * 2 + move, DANCE_STEP_MS * 3, duration].map(Math.round))
    expect(px(frames[0])).toBe(0); expect(px(frames[1])).toBeCloseTo(100, 1); expect(px(frames[2])).toBeCloseTo(px(frames[1]), 5) // постоял в правом углу
    expect(px(frames[3])).toBeCloseTo(-100, 1); expect(px(frames[4])).toBeCloseTo(-100, 1); expect(px(frames[5])).toBeCloseTo(100, 1); expect(px(frames.at(-1))).toBe(0)
    expect(edgeXs(50)).toEqual([75, 25, 75])
  })
  it('от своего места (не центра): первый размах всё равно вправо, возврат — на то место', () => {
    const { frames } = danceFrames({ x0: 27, headW: 50, stageW: 400 })
    expect(px(frames[0])).toBe(0); expect(px(frames[1])).toBeGreaterThan(0); expect(px(frames.at(-1))).toBe(0)
  })
  it('глаза: быстро прикрылись, держатся, плавно открываются за EYES_OPEN_MS до конца; больше ничего не меняется', () => {
    const { frames, duration } = eyeFrames()
    expect(frames.map(f => f.scale)).toEqual(['1 1', `1 ${EYES_SHUT}`, `1 ${EYES_SHUT}`, '1 1']); expect(Math.round(frames[2].offset * duration)).toBe(duration - EYES_OPEN_MS)
    expect(frames.every(f => Object.keys(f).every(k => ['scale', 'offset', 'easing'].includes(k)))).toBe(true)
  })
  it('в коробке / слабое устройство / reduced-motion — танца нет', () => {
    expect(canDance()).toBe(true); expect(canDance({ boxed: true })).toBe(false); expect(canDance({ lite: true })).toBe(false); expect(canDance({ still: true })).toBe(false)
  })
})

describe('запуск на DOM', () => {
  const rig = ({ boxed = false } = {}) => {
    const anim = () => ({ cancel: vi.fn() }), eyes = { style: {}, animate: vi.fn(anim) }, attrs = { 'data-face': 'base' }
    const cat = { offsetWidth: 200, parentElement: { offsetWidth: 400 }, dataset: {}, style: { getPropertyValue: () => '' }, getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v }, animate: vi.fn(anim), querySelectorAll: () => [eyes] }
    const game = { querySelector: sel => (sel.includes('wl-cat') ? cat : sel.includes('wlMia') ? (boxed ? {} : null) : null) }
    return { cat, game, eyes, attrs }
  }
  it('Пит едет, глаза закрываются (scale), лицо НЕ меняется; stop снимает анимации', () => {
    const r = rig(), stop = startNoteDance({ game: r.game })
    expect(r.cat.animate).toHaveBeenCalledTimes(1); expect(r.eyes.animate).toHaveBeenCalledTimes(1); expect(r.attrs['data-face']).toBe('base'); expect(r.eyes.style.transformBox).toBe('fill-box')
    const a = r.cat.animate.mock.results[0].value; stop(); expect(a.cancel).toHaveBeenCalled()
  })
  it('Пит в коробке — танца нет, ничего не трогаем', () => {
    const r = rig({ boxed: true }); expect(startNoteDance({ game: r.game })).toBeNull(); expect(r.cat.animate).not.toHaveBeenCalled(); expect(r.eyes.animate).not.toHaveBeenCalled()
  })
})
