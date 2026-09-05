import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkNodes, formatIntegrity } from './canvasIntegrity.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const n = (id, seq, triggers = []) => ({ id, seq, triggers })

describe('целостность графа урока', () => {
  it('нормальный граф проходит проверку', () => {
    const r = checkNodes([n('a', 1, [{ id: 't1', if: 'timer', then: 'b' }]), n('b', 2)])
    expect(r.ok).toBe(true)
    expect(formatIntegrity(r)).toBe('граф цел: 2 нод')
  })

  it('дубли id ловятся — из-за них связь ведёт «в никуда конкретно»', () => {
    const r = checkNodes([n('a', 1), n('a', 2), n('b', 3)])
    expect(r.ok).toBe(false)
    expect(r.dupIds).toEqual(['a'])
    expect(formatIntegrity(r)).toContain('дубли id: 1')
  })

  it('переход на несуществующую ноду виден отдельно', () => {
    const r = checkNodes([n('a', 1, [{ if: 'timer', then: 'нет' }])])
    expect(r.dangling).toHaveLength(1)
    expect(formatIntegrity(r)).toContain('связи в никуда: 1')
  })

  it('дубли id триггеров и номеров тоже попадают в отчёт', () => {
    const r = checkNodes([
      n('a', 1, [{ id: 'x', if: 'timer', then: null }]),
      n('b', 1, [{ id: 'x', if: 'timer', then: null }]),
    ])
    expect(r.dupTriggerIds).toEqual(['x'])
    expect(r.dupSeq).toEqual([1])
  })

  it('нода без id или без массива триггеров — тоже поломка', () => {
    const r = checkNodes([{ seq: 1 }, { id: 'b', seq: 2 }])
    expect(r.noId).toBe(1)
    expect(r.noTriggers).toBe(2)
    expect(r.ok).toBe(false)
  })
})

describe('дебаг на всём пути импорта', () => {
  it('импорт пишет, что разобрал и что собрал', () => {
    const src = read('./lesson-io/importLesson.js')
    expect(src).toContain("dbg('[IMPORT] разбираю файл:'")
    expect(src).toContain("dbg('[IMPORT] собрано:'")
    expect(src).toContain('formatIntegrity(health)')
  })

  it('приём нод холстом пишет режим и итог', () => {
    const api = read('./useCanvasBoardApi.js')
    expect(api).toContain("dbg('[IMPORT] на холст:', mode")
    expect(api).toContain("dbg('[IMPORT] заменил урок:'")
    expect(api).toContain("dbg('[IMPORT] дописал к уроку:'")
  })

  it('то, что уходит в плеер и в сохранение, тоже проверяется', () => {
    expect(read('./CanvasPage.jsx')).toContain("dbg('[GRAPH] ⚠ наружу уходит'")
  })

  it('плеер сообщает о переходе в никуда, а не молча встаёт', () => {
    const graph = read('../player/useGraphPlayer.js')
    expect(graph).toContain('переход в никуда: нет ноды')
    expect(graph).toContain('СВЯЗЕЙ В НИКУДА')
  })

  it('лог отвечает, почему связи не видно: слои, прожектор, попадание в кадр', () => {
    const hook = read('./useLinkDebugLog.js')
    expect(hook).toContain('слой связей:')
    expect(hook).toContain('слой портов:')
    expect(hook).toContain('прожектор:')
    expect(hook).toContain('в кадре: нод')
    expect(hook).toContain('ближайший порт смещён на')
    expect(hook).toContain('canvasSpotlight')
  })

  it('в логе видно, чем и какой толщиной красится линия', () => {
    const hook = read('./useLinkDebugLog.js')
    expect(hook).toContain('линия: stroke')
    expect(hook).toContain('getTotalLength()')
    expect(hook).toContain('порт: fill')
  })

  it('отладка рисует метки и обычным HTML — мимо SVG', () => {
    expect(read('./CanvasLinkDebug.jsx')).toContain('export function CanvasLinkDebugHtml')
    expect(read('./CanvasLinkDebug.jsx')).toContain('<CanvasLinkDebugHtml segments={debug.segments}')
    expect(read('./CanvasBoard.jsx')).toContain('<CanvasDebugOverlay debug={linkDebug}')
    const css = readFileSync(fileURLToPath(new URL('../../styles/canvas/page.css', import.meta.url)), 'utf8')
    expect(css).toContain('.canvasLinkDebugMark')
  })

  it('проба SVG рисует четыре линии разными способами', () => {
    const src = read('./CanvasLinkDebug.jsx')
    expect(src).toContain('export function CanvasSvgProbe')
    expect(src).toContain('transform="translate(0,40) scale(0.53)"')
    expect(src).toContain("vectorEffect: 'non-scaling-stroke'")
  })

  it('лог показывает атрибуты отрисовки и форму данных ноды', () => {
    const hook = read('./useLinkDebugLog.js')
    expect(hook).toContain('битых ${badPath}')
    expect(hook).toContain('d[0]:')
    expect(hook).toContain('нода[0] #')
    expect(hook).toContain('ключи: ')
  })

  it('очистка урока есть прямо в шапке', () => {
    const actions = read('./CanvasHeaderActions.jsx')
    expect(actions).toContain('canvasPageClear')
    expect(actions).toContain('boardApiRef.current?.clearAll()')
  })
})

describe('дебаг создания нод и связей', () => {
  it('кнопка «+ Нода» пишет, что создала', () => {
    expect(read('./CanvasBoard.jsx')).toContain("dbg('[NODE] кнопка «+ Нода»:'")
  })

  it('вставка после ноды и с порта тоже логируются', () => {
    const ops = read('./useCanvasNodeOps.js')
    expect(ops).toContain("dbg('[NODE] вставка после #'")
    expect(ops).toContain("dbg('[NODE] с порта #'")
  })

  it('ручная протяжка порта пишет, что с чем связала', () => {
    expect(read('./useCanvasPortDrag.js')).toContain("dbg('[LINK] протяжка порта:'")
  })

  it('перепись DOM показывает, отрисовался ли каждый слой', () => {
    const hook = read('./useLinkDebugLog.js')
    expect(hook).toContain('в DOM всего: досок')
    expect(hook).toContain('if (!debugOn) return')
    expect(hook).toContain('меток отладки')
  })
})

describe('лог маршрутов связей', () => {
  it('видно самый размашистый маршрут — так ловятся дальние обходы', () => {
    const hook = read('./useLinkDebugLog.js')
    expect(hook).toContain('самый длинный путь')
    expect(hook).toContain('getTotalLength()')
    expect(hook).toContain('getBBox()')
  })
})

describe('протяжка связи не зависит от сдвига холста', () => {
  it('перед протяжкой положение доски перемеряется заново', () => {
    const board = read('./CanvasBoard.jsx')
    expect(board).toContain('const measureBoard = useCallback(')
    expect(board).toContain('measureBoard()')
    expect(board).toContain('setTypeMenu, measureBoard })')
  })

  it('порт считает мировые координаты после свежего замера и пишет их в лог', () => {
    const port = read('./useCanvasPortDrag.js')
    expect(port).toContain('measureBoard?.()')
    expect(port).toContain("dbg('[LINK] взял порт:'")
    expect(port).toContain('const world = toWorld(e.clientX, e.clientY)')
  })
})
