import { useState, useRef, useCallback } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import { nodeEntry } from './canvasPorts.js'
import { suppressTextSelection } from './canvasDragGuard.js'
import { computeMenuPos } from '../../shared/lib/menuPosition.js'
import { nodeAtPos } from './canvasHitTest.js'
import { renumber } from './nodeGraph.js'

// Радиус (в мировых координатах), в котором брошенный порт цепляется
// к входной точке ноды.
const SNAP_R = 40

// Протяжка соединения от выходного кружка ноды: тянем линию за курсором,
// на отпускании — либо привязка к ближайшей ноде (снап по входной точке,
// потом по телу), либо, если мышь не поехала (клик), меню создания новой
// ноды сразу с привязкой к этому выходу. Вынесено из CanvasBoard.jsx —
// handleMove/handleUp возвращают true, если событие «съедено» портом,
// чтобы вызывающий код (общие обработчики мыши доски) не обрабатывал его
// повторно как рамку выделения/панорамирование.
export function useCanvasPortDrag({ nodes, triggerMeasures, toWorld, setNodes, setTypeMenu, measureBoard }) {
  const [portDrag, setPortDrag] = useState(null)
  const portDragRef = useRef(null)

  const startPortDrag = useCallback((fromNodeId, triggerIdx, e) => {
    e.stopPropagation()
    suppressTextSelection(e) // протяжка порта тоже не должна тянуть выделение
    // Доска могла сдвинуться с прошлого замера — иначе тянущаяся линия считает
    // мировые координаты от старого положения и уходит мимо курсора
    measureBoard?.()
    const world = toWorld(e.clientX, e.clientY)
    dbg('[LINK] взял порт:', `триггер ${triggerIdx}`,
      `курсор ${Math.round(e.clientX)},${Math.round(e.clientY)}`,
      `→ мир ${Math.round(world.x)},${Math.round(world.y)}`)
    const pd = {
      fromNodeId, triggerIdx,
      // экранная точка нажатия: если мышь так и не поехала, это был клик —
      // открываем меню создания ноды вместо соединения
      downX: e.clientX, downY: e.clientY,
      ...world,
    }
    portDragRef.current = pd
    setPortDrag(pd)
  }, [toWorld, measureBoard])

  function handlePortMouseMove(e) {
    if (!portDragRef.current) return false
    const pos = toWorld(e.clientX, e.clientY)
    const pd = { ...portDragRef.current, ...pos }
    portDragRef.current = pd
    setPortDrag(pd)
    return true
  }

  function handlePortMouseUp(e) {
    if (!portDragRef.current) return false
    const { fromNodeId, triggerIdx, downX, downY } = portDragRef.current
    // Кружок нажали и отпустили на месте — это клик, а не соединение:
    // предлагаем создать новую ноду и сразу привязать её к этому выходу
    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 5) {
      const r = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0 }
      setTypeMenu({ pos: computeMenuPos(r), nodeId: fromNodeId, triggerIdx })
      portDragRef.current = null
      setPortDrag(null)
      return true
    }
    const { x, y } = toWorld(e.clientX, e.clientY)
    // Сначала ближайшая входная точка в радиусе SNAP_R, потом тело ноды
    const snapped = nodes
      .filter(n => n.id !== fromNodeId)
      .map(n => { const p = nodeEntry(n, triggerMeasures); return { n, d: Math.hypot(x - p.x, y - p.y) } })
      .filter(o => o.d <= SNAP_R)
      .sort((a, b) => a.d - b.d)[0]?.n ?? null
    const hit = snapped ?? nodeAtPos(nodes, x, y, fromNodeId)
    const from = nodes.find(n => n.id === fromNodeId)
    dbg('[LINK] протяжка порта:', `#${from?.seq ?? '?'} триггер ${triggerIdx}`,
      hit ? `→ #${hit.seq}` : '→ пусто (связь снята)', `бросок в ${Math.round(x)},${Math.round(y)}`)
    setNodes(prev => renumber(prev.map(n =>
      n.id !== fromNodeId ? n : {
        ...n,
        triggers: n.triggers.map((t, i) =>
          i !== triggerIdx ? t : { ...t, then: hit ? hit.id : null }
        ),
      }
    )))
    portDragRef.current = null
    setPortDrag(null)
    return true
  }

  return { portDrag, startPortDrag, handlePortMouseMove, handlePortMouseUp }
}
