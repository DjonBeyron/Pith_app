import { describe, it, expect, vi } from 'vitest'
import { danceFrames, edgeXs, canDance, startNoteDance, DANCE_STEP_MS, DANCE_HOME_MS, EYES_BEFORE_MS, DANCE_FACE } from './raceNoteDance.js'

// v3.3.282: «танец» Пита на трёх нотах — вправо, влево, вправо до краёв экрана, плавно (ease-in-out), назад на место; глаза закрыты, перед первым словом открываются; в коробке — не нужно
describe('кадры танца', () => {
  it('из центра: к 1-й ноте (+шаг) — правый край, ко 2-й — левый, к 3-й — правый, в конце — на месте; смещения симметричны', () => {
    const { frames, duration } = danceFrames({ x0: 50, headW: 50, stageW: 400 })
    expect(duration).toBe(DANCE_STEP_MS * 3 + DANCE_HOME_MS)
    const px = f => parseFloat(f.translate)
    expect(frames.map(f => Math.round(f.offset * duration))).toEqual([0, 600, 1200, 1800, duration])
    expect(px(frames[0])).toBe(0); expect(px(frames[1])).toBeGreaterThan(0); expect(px(frames[2])).toBeLessThan(0); expect(px(frames[3])).toBeGreaterThan(0); expect(px(frames[4])).toBe(0)
    expect(px(frames[1])).toBeCloseTo(-px(frames[2]), 5); expect(px(frames[1])).toBeCloseTo(px(frames[3]), 5)
    expect(frames.slice(0, 4).every(f => f.easing === 'ease-in-out')).toBe(true)
  })
  it('от своего места (не центра): первый размах всё равно вправо, возврат — на то место', () => {
    const { frames } = danceFrames({ x0: 27, headW: 50, stageW: 400 }), px = f => parseFloat(f.translate)
    expect(px(frames[0])).toBe(0); expect(px(frames[1])).toBeGreaterThan(0); expect(px(frames.at(-1))).toBe(0)
    expect(edgeXs(50)[0]).toBeLessThan(100); expect(edgeXs(50)[1]).toBeGreaterThan(0)
  })
  it('в коробке / слабое устройство / reduced-motion — танца нет', () => {
    expect(canDance()).toBe(true); expect(canDance({ boxed: true })).toBe(false); expect(canDance({ lite: true })).toBe(false); expect(canDance({ still: true })).toBe(false)
  })
})

describe('запуск на DOM', () => {
  const rig = ({ boxed = false } = {}) => {
    const attrs = { 'data-face': 'base' }, anim = { cancel: vi.fn() }
    const cat = { offsetWidth: 200, parentElement: { offsetWidth: 400 }, dataset: {}, style: { getPropertyValue: () => '' }, getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v }, animate: vi.fn(() => anim) }
    const game = { querySelector: sel => (sel.includes('wl-cat') ? cat : sel.includes('wlMia') ? (boxed ? {} : null) : null) }
    return { cat, game, attrs, anim }
  }
  it('глаза закрыты на время размахов и открываются за EYES_BEFORE_MS до конца; stop снимает анимацию и возвращает лицо', () => {
    const r = rig(), timers = []
    const stop = startNoteDance({ game: r.game, setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length }, clearTimer: () => {} })
    expect(r.cat.animate).toHaveBeenCalledTimes(1); expect(r.attrs['data-face']).toBe(DANCE_FACE)
    expect(timers[0].ms).toBe(DANCE_STEP_MS * 3 + DANCE_HOME_MS - EYES_BEFORE_MS); timers[0].f(); expect(r.attrs['data-face']).toBe('base')
    r.attrs['data-face'] = DANCE_FACE; stop(); expect(r.anim.cancel).toHaveBeenCalled(); expect(r.attrs['data-face']).toBe('base')
  })
  it('Пит в коробке — танца нет, лицо не трогаем', () => {
    const r = rig({ boxed: true }); expect(startNoteDance({ game: r.game })).toBeNull(); expect(r.cat.animate).not.toHaveBeenCalled(); expect(r.attrs['data-face']).toBe('base')
  })
})
