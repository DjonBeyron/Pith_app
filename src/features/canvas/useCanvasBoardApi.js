import { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import { checkNodes, formatIntegrity } from './canvasIntegrity.js'
import { spreadNodes } from './canvasSpread.js'
import { compactLayout, graphSize } from './canvasCompact.js'
import { renumber, NODE_SLOT } from './nodeGraph.js'
import { useBoardScrollGuard, checkBoardLayers } from './useBoardScrollGuard.js'

// Сколько держится «прожектор» на ноде, к которой перешли из плеера
// (возврат остальных — плавный, за счёт CSS-перехода, см. spotlight.css)
const SPOTLIGHT_MS = 1000

// Что холст умеет по команде снаружи: кнопки шапки CanvasPage и правая панель
// редактора в плеере дотягиваются сюда через ref. Ноды, смещение и масштаб
// живут в CanvasBoard — поднимать их в CanvasPage ради нескольких кнопок
// смысла нет, поэтому команды идут вниз, а не состояние вверх.
//
// Возвращает id ноды, на которой сейчас «прожектор» (или null).
export function useCanvasBoardApi(ref, {
  nodes, setNodes, updateNode, selectOnly, boardRef, scaleRef, setScale, setOffset,
}) {
  const [spotlightId, setSpotlightId] = useState(null)
  const spotTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(spotTimerRef.current), [])

  // Доска не должна быть прокручена внутри себя — иначе пропадают ВСЕ связи
  // (подробности в useBoardScrollGuard.js). Слои перепроверяются заново, когда
  // набор нод сменился целиком — прежде всего после импорта урока
  useBoardScrollGuard(boardRef, nodes.length)

  // Поставить ноду в центр холста (масштаб 1); select — заодно выделить её
  // и на секунду притушить всё остальное
  const centerOn = useCallback((node, select) => {
    const el = boardRef.current
    const rect = el ? el.getBoundingClientRect() : { width: 900, height: 600 }
    scaleRef.current = 1
    setScale(1)
    setOffset({ x: rect.width / 2 - node.x - 91, y: rect.height / 2 - node.y - 20 })
    if (!select) return
    selectOnly(node.id)
    setSpotlightId(node.id)
    clearTimeout(spotTimerRef.current)
    spotTimerRef.current = setTimeout(() => setSpotlightId(null), SPOTLIGHT_MS)
  }, [selectOnly, boardRef, scaleRef, setScale, setOffset])

  useImperativeHandle(ref, () => ({
    // Правка ноды снаружи холста: правая панель редактора в плеере, запущенном
    // из канваса (LessonPlayer → CanvasPage). Ноды живут здесь, поэтому и
    // правка идёт сюда же — второго источника правды не появляется
    updateNode,
    // Обмен уроком в JSON (панель «Поделиться / Импорт», lesson-io/):
    // снимок нод наружу и приём готового сценария обратно
    getNodes() { return nodes },
    importNodes(list, mode) {
      dbg('[IMPORT] на холст:', mode, `${list.length} нод`, `было ${nodes.length}`)
      // Показываем первую импортированную ноду: при «добавить» пачка встаёт
      // правее всего графа, и без этого автор смотрел бы на старый кусок
      // урока, не понимая, приехало что-нибудь или нет
      if (list[0]) setTimeout(() => centerOn(list[0], true), 0)
      // Импорт — самый частый путь к «урок открылся, а связей не видно»:
      // сразу после отрисовки сверяем, что слой связей стоит ровно на доске
      setTimeout(() => {
        const problem = checkBoardLayers(boardRef.current)
        if (problem) dbg('[IMPORT] холст:', problem)
      }, 60)
      setNodes(prev => {
        if (mode === 'replace') {
          const next = renumber(list)
          dbg('[IMPORT] заменил урок:', formatIntegrity(checkNodes(next)))
          return next
        }
        // Дописываем справа от того, что уже есть, — чтобы импорт не лёг
        // поверх существующего графа
        const maxX = prev.reduce((m, n) => Math.max(m, n.x ?? 0), 0)
        const minX = list.reduce((m, n) => Math.min(m, n.x ?? 0), Infinity)
        const shift = prev.length ? maxX + NODE_SLOT - (Number.isFinite(minX) ? minX : 0) : 0
        const merged = renumber([...prev, ...list.map(n => ({ ...n, x: (n.x ?? 0) + shift }))])
        dbg('[IMPORT] дописал к уроку:', formatIntegrity(checkNodes(merged)))
        return merged
      })
    },
    clearAll() {
      if (!window.confirm('Удалить ВСЕ ноды урока? Это нельзя отменить.')) return
      setNodes([])
    },
    spreadNodes() {
      setNodes(prev => spreadNodes(prev))
    },
    // Сжать раскладку: длинную ленту нод собираем «змейкой» в несколько рядов.
    // Сам сценарий не меняется — только координаты на холсте
    compactLayout() {
      setNodes(prev => {
        const before = graphSize(prev)
        const next = compactLayout(prev)
        const after = graphSize(next)
        dbg('[LAYOUT] сжатие:', `${Math.round(before.w)}×${Math.round(before.h)}`,
          '→', `${Math.round(after.w)}×${Math.round(after.h)}`, `нод ${prev.length}`)
        return next
      })
    },
    focusStart() {
      const first = nodes.slice().sort((a, b) => a.seq - b.seq)[0]
      if (first) centerOn(first, false)
    },
    // «К ноде» из плеера: ставим её в центр холста и выделяем, чтобы сразу
    // было видно, о какой ноде речь
    focusNode(nodeId) {
      const n = nodes.find(x => x.id === nodeId)
      if (n) centerOn(n, true)
    },
  }), [nodes, setNodes, updateNode, centerOn, boardRef])

  return spotlightId
}
