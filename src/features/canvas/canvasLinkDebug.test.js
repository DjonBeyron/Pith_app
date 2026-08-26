import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { linkDiagnostics, linkDebugSummary } from './canvasLinkDebug.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const node = (id, seq, triggers) => ({
  id, seq, x: seq * 400, y: 0, size: 'max', type: 'text',
  typeData: { text: { content: '' } }, triggers,
})

describe('диагностика связей холста', () => {
  it('считает триггеры, связи и построенные линии', () => {
    const d = linkDiagnostics([
      node('a', 1, [{ if: 'timer', then: 'b' }]),
      node('b', 2, [{ if: 'timer', then: null }]),
    ])
    expect([d.nodes, d.triggers, d.withThen, d.drawn]).toEqual([2, 2, 1, 1])
    expect(d.missingTarget).toBe(0)
    expect(d.segments[0].ok).toBe(true)
  })

  it('видит переход в никуда — цель не найдена', () => {
    const d = linkDiagnostics([node('a', 1, [{ if: 'timer', then: 'нет-такой' }])])
    expect(d.withThen).toBe(1)
    expect(d.missingTarget).toBe(1)
    expect(d.drawn).toBe(0)
  })

  it('сводка называет всё, что нужно для разбора', () => {
    const d = linkDiagnostics([node('a', 1, [{ if: 'timer', then: 'b' }]), node('b', 2, [])])
    const s = linkDebugSummary(d, 0.4)
    expect(s).toContain('нод 2')
    expect(s).toContain('связей 1')
    expect(s).toContain('линий 1')
    expect(s).toContain('зум 40%')
  })

  it('отладка включается из меню холста и рисует прямые поверх графа', () => {
    expect(read('./CanvasPage.jsx')).toContain("label: debugLinks ? '✓ Отладка связей' : 'Отладка связей'")
    expect(read('./CanvasPage.jsx')).toContain('debugLinks={debugLinks}')
    const board = read('./CanvasBoard.jsx')
    expect(board).toContain('<CanvasLinkDebug segments={linkDebug.segments} />')
    expect(read('./CanvasLinkDebug.jsx')).toContain('canvasLinkDebugBadge')
    expect(read('./CanvasLinkDebug.jsx')).toContain('vectorEffect="non-scaling-stroke"')
  })

  it('разбор уходит и в консоль — лог можно просто прислать', () => {
    const src = read('./canvasLinkDebug.js')
    expect(src).toContain('export function logLinkDebug')
    expect(src).toContain("dbg('[LINKS]'")
    expect(src).toContain(".canvasBoardSvgBack path")
    // сводка идёт через useLinkDebugLog — он же зовёт разбор и перепись DOM
    expect(read('./CanvasBoard.jsx')).toContain('useLinkDebugLog(nodes, triggerMeasures, scaleRef, debugLinks)')
  })

  it('целостность графа проверяется всегда, подробности — только при отладке', () => {
    const hook = read('./useLinkDebugLog.js')
    expect(hook).toContain("dbg('[GRAPH] ⚠', formatIntegrity(health))")
    expect(hook).toContain('if (!debugOn) return')
    expect(hook).toContain('.canvasBoardSvgBack path')
    expect(hook).toContain('if (line === lastRef.current) return')
    expect(read('./CanvasBoard.jsx')).toContain('useLinkDebugLog(nodes, triggerMeasures, scaleRef, debugLinks)')
  })

  it('без отладки ничего не считается — на обычной работе холста ноль', () => {
    expect(read('./CanvasBoard.jsx')).toContain('debugLinks ? linkDiagnostics(nodes, triggerMeasures) : null')
  })
})

describe('холст не схлопывается по высоте', () => {
  it('у доски задан min-height — иначе SVG-слои обрежут связи в ноль', () => {
    const css = readFileSync(fileURLToPath(new URL('../../styles/canvas/page.css', import.meta.url)), 'utf8')
    const block = css.slice(css.indexOf('.canvasBoard {'), css.indexOf('.canvasBoardSvg {'))
    expect(block).toContain('min-height: 240px')
    // сами слои по-прежнему обрезаются по доске — это и делает высоту важной
    expect(css).toContain('.canvasBoardSvg {')
  })

  it('размер доски попадает в лог — по нему видно схлопывание', () => {
    expect(read('./useLinkDebugLog.js')).toContain('доска ${size}')
    expect(read('./useLinkDebugLog.js')).toContain(".canvasBoard')?.getBoundingClientRect()")
  })
})
