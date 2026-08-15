import { useState, useRef, useCallback } from 'react'
import { suppressTextSelection } from './canvasDragGuard.js'
import { toggleSelection, moveGroupFor, nodesInMarquee } from './canvasSelectionOps.js'

// Выделение нескольких нод в canvas: рамкой по левой кнопке над пустым
// местом, или Shift+клик по одной ноде за раз. Протяжка любой ноды из
// текущего выделения (2+) двигает всю группу — см. moveGroup, используется
// в CanvasBoard.jsx moveNode. Вынесено из CanvasBoard.jsx отдельным хуком —
// логика самодостаточна и в основном файле только раздувала бы размер.
export function useCanvasSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  // Актуальное выделение для колбэков. Без него onNodeMouseDown и moveGroup
  // зависели бы от selectedIds, а значит менялись при каждом клике по ноде —
  // и вместе с ними handleNodeMouseDown в CanvasBoard, проп ВСЕХ нод. Из-за
  // этого захват ноды перерисовывал весь граф целиком, и протяжка начиналась
  // с заметной задержкой. Теперь ссылки на колбэки постоянные.
  const selectedRef = useRef(selectedIds)

  // Пишем и в состояние, и в ref разом: ref должен быть верным уже в этом же
  // обработчике мыши, не дожидаясь следующего рендера
  const applySelection = useCallback(next => {
    setSelectedIds(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      selectedRef.current = value
      return value
    })
  }, [])
  // Рамка — экранные координаты относительно boardRef, пока тянется
  const [marquee, setMarquee] = useState(null)
  // Нода, на которую нажали БЕЗ Shift, уже входя в текущее групповое
  // выделение: если протяжки не было (просто клик) — схлопываем выделение
  // до неё одной (как в большинстве графических редакторов)
  const pendingCollapseRef = useRef(null)
  // Снимок выделения на момент начала протяжки рамки — Shift+рамка
  // ДОБАВЛЯЕТ пересечённые ноды к нему, а не заменяет выделение целиком
  const marqueeBaseRef = useRef(new Set())

  // useCallback — эти две функции идут пропсами вплоть до CanvasNode.jsx
  // (через CanvasBoard.jsx), который мемоизирован (React.memo): нестабильная
  // ссылка на проп-функцию срывает мемоизацию КАЖДЫЙ рендер, а не только
  // когда реально меняется выделение (см. CanvasNode.jsx, CanvasBoard.jsx)
  const moveGroup = useCallback(id => moveGroupFor(selectedRef.current, id), [])

  // Средняя кнопка мыши — всегда панорамирование, даже если начали над
  // нодой. Левая: Shift+клик добавляет/убирает ноду из выделения; клик по
  // уже выделенной ноде откладывает схлопывание до mouseup (collapseIfClick)
  const onNodeMouseDown = useCallback((nodeId, e, { startNodeDrag, startCanvasDrag }) => {
    if (e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      startCanvasDrag(e)
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    // Shift+клик по нодам выделение текста не начинает: без этого браузер
    // тянул выделение от места первого клика через все ноды подряд
    suppressTextSelection(e)
    if (e.shiftKey) {
      applySelection(prev => toggleSelection(prev, nodeId))
      return
    }
    if (selectedRef.current.has(nodeId)) {
      pendingCollapseRef.current = nodeId
    } else {
      pendingCollapseRef.current = null
      applySelection(new Set([nodeId]))
    }
    startNodeDrag(nodeId, e)
  }, [applySelection])

  // getRect() — кэшированный getBoundingClientRect холста (CanvasBoard.jsx,
  // boardRectRef), не сам вызов: он форсирует синхронный layout, на потоке
  // mousemove-событий протяжки рамки это и давало рваное движение
  function startMarquee(e, getRect) {
    suppressTextSelection(e)
    const rect = getRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    marqueeBaseRef.current = e.shiftKey ? new Set(selectedRef.current) : new Set()
    if (!e.shiftKey) applySelection(new Set())
    setMarquee({ x0: x, y0: y, x1: x, y1: y })
  }

  // toWorld(clientX, clientY) — из CanvasBoard (учитывает offset/scale).
  // hitSize(node) → {w,h} — хит-бокс ноды (NODE_HIT_W/H в CanvasBoard.jsx)
  function updateMarquee(e, getRect, toWorld, nodes, hitSize) {
    if (!marquee) return false
    const rect = getRect()
    const x1 = e.clientX - rect.left
    const y1 = e.clientY - rect.top
    setMarquee(m => ({ ...m, x1, y1 }))
    const a = toWorld(rect.left + Math.min(marquee.x0, x1), rect.top + Math.min(marquee.y0, y1))
    const b = toWorld(rect.left + Math.max(marquee.x0, x1), rect.top + Math.max(marquee.y0, y1))
    const hitIds = nodesInMarquee(nodes, a, b, hitSize)
    applySelection(new Set([...marqueeBaseRef.current, ...hitIds]))
    return true
  }

  function endMarquee() {
    if (!marquee) return false
    setMarquee(null)
    return true
  }

  // Клик (без протяжки) по уже выделенной группе — схлопываем выделение до
  // этой одной ноды; если была протяжка — группа двигалась, оставляем как есть
  function collapseIfClick(wasDragged) {
    if (pendingCollapseRef.current && !wasDragged()) {
      applySelection(new Set([pendingCollapseRef.current]))
    }
    pendingCollapseRef.current = null
  }

  return {
    selectedIds, marquee, moveGroup,
    onNodeMouseDown, startMarquee, updateMarquee, endMarquee, collapseIfClick,
  }
}
