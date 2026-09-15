import { useState, useRef, useCallback } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import { nodeEntry } from './canvasPorts.js'
import { suppressTextSelection } from './canvasDragGuard.js'
import { computeMenuPos } from '../../shared/lib/menuPosition.js'
import { nodeAtPos } from './canvasHitTest.js'
import { renumber } from './nodeGraph.js'

// Радиус примагничивания — тот же, что и у обычного порта триггера
// (useCanvasPortDrag.js), слоты и триггеры физически не пересекаются на ноде.
const SNAP_R = 40

// Всё, что нужно CanvasBoard.jsx для портов СИГНАЛОВ ошибок (слот ответа
// table/manual или phrase_assembly, см. NodeSignalsPicker.jsx) — два хука в
// одном файле, а не два отдельных вызова в CanvasBoard.jsx (тот файл и так у
// потолка 400 строк, CLAUDE.md): измерение Y-центров строк слотов
// (параллельно triggerMeasures) и сама протяжка порта.
//
// Протяжка — та же механика, что useCanvasPortDrag.js у триггеров, только
// пишет не triggers[i].then, а typeData[node.type].signals массив
// [{slot, ref}]. Главное отличие от триггера: у сигнала промах (бросили в
// пустоту) — это не `then: null`, а УДАЛЕНИЕ записи слота целиком, пустого
// сигнала «в никуда» не бывает (тот же приём, что у setRef в NodeSignalsPicker.jsx).
export function useCanvasSignalPortDrag({ nodes, triggerMeasures, toWorld, setNodes, setTypeMenu, measureBoard }) {
  const [signalMeasures, setSignalMeasures] = useState({})
  const handleSignalMeasure = useCallback((nodeId, offsets) => {
    setSignalMeasures(prev => {
      const existing = prev[nodeId]
      if (existing && existing.length === offsets.length &&
          existing.every((v, i) => v === offsets[i])) return prev
      return { ...prev, [nodeId]: offsets }
    })
  }, [])

  const [signalDrag, setSignalDrag] = useState(null)
  const signalDragRef = useRef(null)

  const startSignalDrag = useCallback((fromNodeId, slotIndex, e) => {
    e.stopPropagation()
    suppressTextSelection(e)
    measureBoard?.()
    const world = toWorld(e.clientX, e.clientY)
    dbg('[LINK] взял порт сигнала:', `слот ${slotIndex}`,
      `курсор ${Math.round(e.clientX)},${Math.round(e.clientY)}`,
      `→ мир ${Math.round(world.x)},${Math.round(world.y)}`)
    const sd = {
      fromNodeId, slotIndex,
      downX: e.clientX, downY: e.clientY,
      ...world,
    }
    signalDragRef.current = sd
    setSignalDrag(sd)
  }, [toWorld, measureBoard])

  function handleSignalMouseMove(e) {
    if (!signalDragRef.current) return false
    const pos = toWorld(e.clientX, e.clientY)
    const sd = { ...signalDragRef.current, ...pos }
    signalDragRef.current = sd
    setSignalDrag(sd)
    return true
  }

  function handleSignalMouseUp(e) {
    if (!signalDragRef.current) return false
    const { fromNodeId, slotIndex, downX, downY } = signalDragRef.current
    // Кружок нажали и отпустили на месте — клик, а не протяжка: предлагаем
    // создать ноду-сигнал и сразу привязать её к этому слоту
    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 5) {
      const r = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0 }
      setTypeMenu({ pos: computeMenuPos(r), nodeId: fromNodeId, slotIndex })
      signalDragRef.current = null
      setSignalDrag(null)
      return true
    }
    const { x, y } = toWorld(e.clientX, e.clientY)
    const snapped = nodes
      .filter(n => n.id !== fromNodeId)
      .map(n => { const p = nodeEntry(n, triggerMeasures); return { n, d: Math.hypot(x - p.x, y - p.y) } })
      .filter(o => o.d <= SNAP_R)
      .sort((a, b) => a.d - b.d)[0]?.n ?? null
    const hit = snapped ?? nodeAtPos(nodes, x, y, fromNodeId)
    const from = nodes.find(n => n.id === fromNodeId)
    dbg('[LINK] протяжка сигнала:', `#${from?.seq ?? '?'} слот ${slotIndex}`,
      hit ? `→ #${hit.seq}` : '→ пусто (сигнал снят)', `бросок в ${Math.round(x)},${Math.round(y)}`)
    setNodes(prev => renumber(prev.map(n => {
      if (n.id !== fromNodeId) return n
      const key = n.type
      const tData = n.typeData?.[key] ?? {}
      const rest = (tData.signals ?? []).filter(s => s.slot !== slotIndex)
      const signals = hit ? [...rest, { slot: slotIndex, ref: hit.id }] : rest
      return { ...n, typeData: { ...n.typeData, [key]: { ...tData, signals } } }
    })))
    signalDragRef.current = null
    setSignalDrag(null)
    return true
  }

  return {
    signalMeasures, handleSignalMeasure,
    signalDrag, startSignalDrag, handleSignalMouseMove, handleSignalMouseUp,
  }
}
