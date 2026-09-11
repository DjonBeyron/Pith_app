import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { clampScale, zoomAtPoint } from './canvasZoom.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const hook  = read('./useCanvasTouch.js')
const board = read('./CanvasBoard.jsx')
const css   = read('../../styles/canvas/page.css')

// На телефоне у холста не было ни мыши, ни колеса — доску нельзя было ни
// подвинуть, ни приблизить. Замеры на эмуляции касаний (375x812, 5 точек):
//   панорама:  translate(0,0) → translate(90px,-48px) за 6 шагов по 15/-8
//   щипок ×1.5: масштаб 1.5 → 2.25, точка мира под серединой 98.30 → 98.30
//   палец по ноде: доска не сдвинулась вовсе
describe('жесты холста', () => {
  it('панорама одним пальцем, щипок двумя', () => {
    expect(hook).toContain("mode = 'pinch'")
    expect(hook).toContain("mode = 'pan'")
    // Щипок — это и масштаб, и сдвиг середины разом, одним setOffset:
    // двумя правками между ними успевал отрисоваться промежуточный кадр
    expect(hook).toMatch(/setOffset\(o => \{[\s\S]*zoomAtPoint[\s\S]*x: z\.x \+ dx/)
  })

  it('палец, начавшийся на ноде или в поле ввода, доску не двигает', () => {
    // Иначе нельзя ни нажать ноду, ни поставить курсор в текст
    expect(hook).toContain("t.target?.closest?.('.canvasNodeWrapper')")
    expect(hook).toContain('isTextZone(t.target)')
    expect(hook).toContain('mode = null')
  })

  it('touchmove не пассивный — иначе страница уедет вместе с холстом', () => {
    expect(hook).toContain("el.addEventListener('touchmove', onMove, { passive: false })")
    expect(hook).toContain('e.preventDefault()')
  })

  it('жесты отданы холсту, а не браузеру', () => {
    const rule = css.slice(css.indexOf('.canvasBoard {'))
    expect(rule.slice(0, rule.indexOf('}'))).toContain('touch-action: none')
  })

  it('из щипка в панораму переходим без рывка', () => {
    // Убрали один палец — оставшийся продолжает тащить, но точку отсчёта
    // надо переставить на него, иначе доска прыгнет на разницу
    const end = hook.slice(hook.indexOf('function onEnd'))
    expect(end).toContain("mode = 'pan'")
    expect(end).toContain('last = { x: e.touches[0].clientX')
  })

  it('холст подключает хук', () => {
    expect(board).toContain("import { useCanvasTouch } from './useCanvasTouch.js'")
    expect(board).toContain('useCanvasTouch(boardRef, boardRectRef, scaleRef, setScale, setOffset)')
  })
})

// Та же арифметика, что у колеса: точка под пальцами остаётся под пальцами
describe('щипок считает масштаб как колесо', () => {
  it('точка под серединой не уезжает', () => {
    const off = { x: 40, y: -258 }
    const cur = 1.5, next = clampScale(cur * 1.5)
    const px = 187, py = 440
    const z = zoomAtPoint(off, cur, next, px, py)
    // мировая координата под точкой — до и после
    expect((px - z.x) / next).toBeCloseTo((px - off.x) / cur, 6)
    expect((py - z.y) / next).toBeCloseTo((py - off.y) / cur, 6)
  })

  it('масштаб зажат теми же границами', () => {
    expect(clampScale(1.5 * 1.5)).toBe(2.25)
    expect(clampScale(99)).toBe(2.5)
    expect(clampScale(0.0001)).toBe(0.05)
  })
})
