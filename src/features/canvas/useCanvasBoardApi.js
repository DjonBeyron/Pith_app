import { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react'
import { spreadNodes } from './canvasSpread.js'

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
    clearAll() {
      if (!window.confirm('Удалить ВСЕ ноды урока? Это нельзя отменить.')) return
      setNodes([])
    },
    spreadNodes() {
      setNodes(prev => spreadNodes(prev))
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
  }), [nodes, setNodes, updateNode, centerOn])

  return spotlightId
}
