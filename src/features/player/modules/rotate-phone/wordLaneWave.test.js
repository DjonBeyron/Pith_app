import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tiltDeg, sine, wavePosition, waveRotate, viewHeightPx, TILT_MAX_DEG } from './wordLaneWave.js'
import { riseFrames, RISE_WAVE_PX, RISE_WAVES } from './wordLaneRise.js'
import { flightPosition, startFlight } from './wordLaneMotion.js'
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'

// Математика волны (wordLaneWave.js) нужна ТОЛЬКО взлёту: полёт вниз — прямая, без волны и наклона (решение владельца, v3.3.65)
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const H = 812

describe('наклон пилюли — по касательной к пути вокруг центра', () => {
  it('tiltDeg: -atan(dx/dy) в градусах, знак по часовой для dx < 0 при ходе вниз, потолок TILT_MAX_DEG, нулевой ход — 0', () => {
    expect(tiltDeg(0, 100)).toBeCloseTo(0, 10)
    expect(tiltDeg(10, 100)).toBeCloseTo(-(Math.atan(0.1) * 180) / Math.PI, 8)  // уходит вправо вниз: низ пилюли вправо — против часовой (−)
    expect(tiltDeg(-10, 100)).toBeGreaterThan(0)
    expect(tiltDeg(10, -100)).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 8)   // вверх с тем же dx: верх вправо — по часовой (+)
    expect(tiltDeg(1000, 1)).toBe(-TILT_MAX_DEG)
    expect(tiltDeg(5, 0)).toBe(0)
  })
  it('sine: x и производная dx/du синусоиды amp·sin(2π·waves·u + phase)', () => {
    expect(sine(10, 1, 0, 0)).toEqual({ x: 0, dx: 10 * 2 * Math.PI })
    expect(sine(10, 1, 0, 0.25).x).toBeCloseTo(10, 10)
    expect(sine(10, 1, 0, 0.25).dx).toBeCloseTo(0, 8)
    expect(sine(10, 0.8, Math.PI / 2, 0).x).toBeCloseTo(10, 10)
  })
  it('угол кадра взлёта = -atan(dx/dy) по соседним кадрам (px/px) там, где стык уже погашен, и меняется плавно', () => {
    const f = riseFrames(50, H)
    const xs = f.map(x => Number(x.translate.match(/\+ (-?[\d.]+)px/)[1]))
    const ys = f.map(x => Number(x.translate.match(/calc\((-?[\d.]+)dvh/)[1]))
    for (let i = 1; i < f.length - 1; i++) {
      if (f[i].offset < 0.4) continue                                                 // до RISE_TILT_BLEND угол ещё смешан с нулевым наклоном спуска
      const num = (-Math.atan((xs[i + 1] - xs[i - 1]) / (((ys[i + 1] - ys[i - 1]) / 100) * H)) * 180) / Math.PI
      expect(parseFloat(f[i].rotate)).toBeCloseTo(Math.max(-TILT_MAX_DEG, Math.min(TILT_MAX_DEG, num)), -0.3)  // разностная производная ≈ аналитическая (шаг 1/24 пути)
    }
  })
  it('якорь по центру: поворот — отдельное свойство rotate вокруг центра (translate ведёт центр, rotate после него в цепочке), а не transform', () => {
    expect(waveRotate(1.23456)).toBe('1.235deg')
    expect(wavePosition(10, 3)).toBe('calc(-50% + 3.00px) calc(10.000dvh - 50%)')
    expect(riseFrames(50, H).every(x => Object.keys(x).every(k => ['offset', 'rotate', 'translate', 'scale', 'opacity'].includes(k)))).toBe(true)
    const css = read('../../../../styles/player/modules/word-lane-pill.css')
    expect(css).not.toMatch(/\.wlPill \{[^}]*\n {2}(transform|rotate):/)          // база пилюли rotate / transform не задаёт: они свободны для анимации и дрожки промаха
    expect(css).not.toMatch(/\.wlPill \{[^}]*transform-origin/)                   // origin по умолчанию — центр
  })
  it('viewHeightPx: без окна (тесты, SSR) — 812, как у iPhone 12 mini', () => {
    expect(viewHeightPx()).toBe(typeof window === 'undefined' ? 812 : window.innerHeight)
  })
})

describe('волна — только у взлёта, спуск прямой', () => {
  it('параметры взлёта: размах 12 px, 0,8 периода; волна начинается с x = 0 и наклона 0', () => {
    expect([RISE_WAVE_PX, RISE_WAVES]).toEqual([12, 0.8])
    const f = riseFrames(50, H)
    expect(f[0].translate).toBe(wavePosition(50, 0))
    expect(f[0].rotate).toBe('0.000deg')
  })
  it('полёт вниз — три кадра по одному translate по y: ни x, ни rotate, ни calc с px', () => {
    const calls = []
    const el = { animate: (frames, o) => { calls.push({ frames, o }); return { currentTime: 0 } } }
    startFlight(el, 0)
    const { frames } = calls[0]
    expect(frames).toHaveLength(3)
    expect(frames.every(x => Object.keys(x).every(k => k === 'translate' || k === 'offset'))).toBe(true)
    expect(frames.every(x => !/px|rotate/.test(JSON.stringify(x)))).toBe(true)
    expect(frames[0].translate).toBe(flightPosition(ENTER_Y))
    expect(frames[1].translate).toBe(flightPosition(EXIT_Y))
  })
  it('в коде спуска нет волны: wordLaneMotion.js не импортирует wordLaneWave, а пул передаёт в startFlight только элемент и время', () => {
    expect(read('./wordLaneMotion.js')).not.toMatch(/import .*wordLaneWave|flightPose|flightFrames|rotate:/)
    expect(read('./wordLanePool.js')).toContain('startFlight(el, atMs)')
    expect(read('./wordLaneWave.js')).not.toMatch(/FLIGHT_WAVE|flightPose|flightPhase/)
  })
})
