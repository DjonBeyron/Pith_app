import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { startExit, stageExitFrames, exitMs, STAGE_EXIT_MS, STAGE_EXIT_LITE_MS } from './rehearsalExit.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Подставная сцена: дети с animate; окно итога — один из них
const make = () => ({ animate: vi.fn(() => ({})), getBoundingClientRect: () => ({ top: 300, height: 200 }) })
function scene() {
  const plate = make(), a = make(), b = make()
  const stage = { children: [a, plate, b] }
  plate.closest = sel => (sel === '.wlStage' ? stage : null)
  return { plate, a, b }
}

describe('уход с итога: «Нет» — окно улетает, игра опускается и тает', () => {
  it('окно улетает по кривой пилюли (translate/rotate/scale/opacity, 750 мс), сцена: все дети, кроме окна, опускаются и гаснут за 600 мс', () => {
    const { plate, a, b } = scene()
    expect(startExit(plate, false)).toBe(2)
    expect(plate.animate).toHaveBeenCalledTimes(1) // полёт окна (startPlateExit)
    expect(plate.animate.mock.calls[0][1]).toMatchObject({ duration: 750, fill: 'both' })
    for (const el of [a, b]) {
      expect(el.animate).toHaveBeenCalledTimes(1)
      const [kf, opts] = el.animate.mock.calls[0]
      expect(kf[0]).toMatchObject({ opacity: 1 }); expect(kf[1]).toMatchObject({ opacity: 0 })
      expect(kf[1].translate).toMatch(/^0 \d+dvh$/) // вниз
      expect(opts).toMatchObject({ duration: STAGE_EXIT_MS, fill: 'forwards' })
    }
    expect(STAGE_EXIT_MS).toBe(600)
  })
  it('lite: окно не летит (его гасит класс), сцена только гаснет по opacity без спуска', () => {
    const { plate, a } = scene()
    startExit(plate, true)
    expect(plate.animate).not.toHaveBeenCalled()
    const [kf, opts] = a.animate.mock.calls[0]
    expect(kf).toEqual(stageExitFrames(true)); expect(kf.every(f => !('translate' in f))).toBe(true)
    expect(opts.duration).toBe(STAGE_EXIT_LITE_MS); expect(exitMs(true)).toBe(STAGE_EXIT_LITE_MS); expect(exitMs(false)).toBe(STAGE_EXIT_MS)
  })
  it('нет окна или сцены — не падает', () => {
    expect(startExit(null, false)).toBe(0)
    expect(startExit({ closest: () => null, animate: () => ({}), getBoundingClientRect: () => ({ top: 0, height: 0 }) }, true)).toBe(0)
  })
  it('компонент: «Нет» запускает startExit и вызывает onDone только после затухания; кнопки блокируются; таймер снимается при размонтировании', () => {
    const src = read('./RehearsalSummary.jsx')
    expect(src).toContain('startExit(ref.current, lite)')
    expect(src).toContain('timer.current = setTimeout(() => onDone?.(), exitMs(lite))')
    expect(src).toContain('useEffect(() => () => clearTimeout(timer.current), [])')
    expect(src).toContain("disabled={leaving}")
    expect(src).toContain("className={`wlTurn rhScreen rhSumPlate")
  })
  it('стиль: окно итога — на плашке .wlTurn, без своих тяжёлых слоёв; кнопки в ряд', () => {
    const css = read('../../styles/player/modules/rehearsal.css')
    expect(css).toMatch(/\.rhSumPlate \{[^}]*width: min\(90%, 420px\)/)
    expect(css).toMatch(/\.rhBtns--row \{ flex-direction: row;/)
  })
})
