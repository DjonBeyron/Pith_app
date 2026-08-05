import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { canvasLsKey } from './canvasStorageKeys.js'
import CanvasNode from './CanvasNode.jsx'
import CanvasConnections from './CanvasConnections.jsx'
import { nodeEntry } from './canvasPorts.js'
import { useCanvasDrag } from './useCanvasDrag.js'
import { useCanvasSelection } from './useCanvasSelection.js'
import { useCanvasNodeOps } from './useCanvasNodeOps.js'
import { renumber, makeNode } from './nodeGraph.js'

// Радиус (в мировых координатах), в котором брошенный порт цепляется
// к входной точке ноды.
const SNAP_R = 40

// Ключ черновика — в canvasStorageKeys.js (не здесь: этот файл не должен
// экспортировать ничего, кроме компонента, иначе ломается Fast Refresh).
// CanvasPage.handleSave чистит его сразу после успешного сохранения: черновик
// нужен только чтобы не терять НЕсохранённые правки при случайной
// перезагрузке страницы — s.nodes в loadSaved() ниже имеет приоритет над
// initialNodes при каждом монтировании, поэтому несброшенный черновик
// навсегда перекрывал бы настоящие данные с сервера
const CANVAS_LS = canvasLsKey

function loadSaved(lessonId) {
  if (!lessonId) return {}
  try { return JSON.parse(localStorage.getItem(CANVAS_LS(lessonId)) ?? '{}') } catch { return {} }
}

const NODE_HIT_W = { nano: 42, mini: 182, max: 220 }
const NODE_HIT_H = { nano: 36, mini: 55,  max: 500 }
function nodeAtPos(nodeList, wx, wy, excludeId) {
  return nodeList.find(n => {
    if (n.id === excludeId) return false
    const w = NODE_HIT_W[n.size] ?? 158
    const h = NODE_HIT_H[n.size] ?? 200
    return wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h
  })
}

const CanvasBoard = forwardRef(function CanvasBoard({
  initialNodes, lessonFiles = [], onPickLessonFile, lessonId, onNodesChange,
  moduleLessons = [],
}, ref) {
  const [nodes, setNodes] = useState(() => {
    const s = loadSaved(lessonId)
    return s.nodes?.length ? s.nodes : (initialNodes?.length ? initialNodes : [makeNode(1, 120, 80)])
  })
  const [offset, setOffset] = useState(() => loadSaved(lessonId).offset ?? { x: 0, y: 0 })
  const [scale, setScale]   = useState(() => {
    const s = loadSaved(lessonId)
    return typeof s.scale === 'number' ? s.scale : 1
  })
  const [portDrag,       setPortDrag]       = useState(null)
  const [triggerMeasures, setTriggerMeasures] = useState({})
  const [hoveredNodeId,  setHoveredNodeId]  = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const scaleRef     = useRef(scale)
  const portDragRef  = useRef(null)
  const boardRef     = useRef(null)
  const mountedRef   = useRef(false)

  // Выделение нескольких нод (рамкой по левой кнопке или Shift+клик) —
  // протяжка за любую из выделенных двигает всю группу разом (moveNode)
  const {
    selectedIds, marquee, moveGroup,
    onNodeMouseDown: onSelectionMouseDown, startMarquee, updateMarquee, endMarquee, collapseIfClick,
  } = useCanvasSelection()

  const updateNode = useCallback((id, patch) =>
    // renumber: патч мог изменить триггеры → порядок графа
    setNodes(prev => renumber(prev.map(n => n.id === id ? { ...n, ...patch } : n))), [])

  // Тянем одну ноду — двигается она одна; тянем ноду из группового выделения
  // (2+ нод) — двигается вся группа на тот же dx/dy
  const moveNode = useCallback((id, dx, dy) =>
    setNodes(prev => {
      const group = moveGroup(id)
      return prev.map(n => group.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)
    }), [moveGroup])

  const pan = useCallback((dx, dy) =>
    setOffset(o => ({ x: o.x + dx, y: o.y + dy })), [])

  const { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged } =
    useCanvasDrag({ onNodeMove: moveNode, onPan: pan, scaleRef })

  const handleTriggerMeasure = useCallback((nodeId, offsets) => {
    setTriggerMeasures(prev => {
      const existing = prev[nodeId]
      if (existing && existing.length === offsets.length &&
          existing.every((v, i) => v === offsets[i])) return prev
      return { ...prev, [nodeId]: offsets }
    })
  }, [])

  // Меню ноды — «липучка»: открывается по наведению и висит, пока не кликнут
  // вне ноды/меню (закрытие — в onMouseDown доски) или не наведут другую ноду.
  function enterNode(nodeId) {
    // Вопрос «Удалить?» другой ноды сбрасывается при переходе на новую
    if (confirmDeleteId && confirmDeleteId !== nodeId) setConfirmDeleteId(null)
    setHoveredNodeId(nodeId)
  }

  // Del на наведённой ноде открывает вопрос «Удалить?» (не в полях ввода)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Delete') return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
      if (hoveredNodeId) setConfirmDeleteId(hoveredNodeId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hoveredNodeId])


  const { deleteNode: deleteNodeOp, duplicateNode, insertAfterNode } = useCanvasNodeOps(setNodes)

  function deleteNode(nodeId) {
    setHoveredNodeId(null)
    setConfirmDeleteId(null)
    deleteNodeOp(nodeId)
  }

  function handleNodeMouseDown(nodeId, e) {
    onSelectionMouseDown(nodeId, e, { startNodeDrag, startCanvasDrag })
  }

  function toWorld(clientX, clientY) {
    const rect = boardRef.current.getBoundingClientRect()
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top  - offset.y) / scale,
    }
  }

  function startPortDrag(fromNodeId, triggerIdx, e) {
    e.stopPropagation()
    e.preventDefault() // не даём браузеру начать выделение текста при протяжке
    const pd = { fromNodeId, triggerIdx, ...toWorld(e.clientX, e.clientY) }
    portDragRef.current = pd
    setPortDrag(pd)
  }

  function handleMouseMove(e) {
    if (portDragRef.current) {
      const pos = toWorld(e.clientX, e.clientY)
      const pd = { ...portDragRef.current, ...pos }
      portDragRef.current = pd
      setPortDrag(pd)
      return
    }
    const hitSize = n => ({ w: NODE_HIT_W[n.size] ?? 158, h: NODE_HIT_H[n.size] ?? 200 })
    if (updateMarquee(e, boardRef, toWorld, nodes, hitSize)) return
    onMouseMove(e)
  }

  function handleMouseUp(e) {
    if (endMarquee()) return
    if (portDragRef.current) {
      const { fromNodeId, triggerIdx } = portDragRef.current
      const { x, y } = toWorld(e.clientX, e.clientY)
      // Сначала ближайшая входная точка в радиусе SNAP_R, потом тело ноды
      const snapped = nodes
        .filter(n => n.id !== fromNodeId)
        .map(n => { const p = nodeEntry(n, triggerMeasures); return { n, d: Math.hypot(x - p.x, y - p.y) } })
        .filter(o => o.d <= SNAP_R)
        .sort((a, b) => a.d - b.d)[0]?.n ?? null
      const hit = snapped ?? nodeAtPos(nodes, x, y, fromNodeId)
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
      return
    }
    endDrag()
    collapseIfClick(wasDragged)
  }

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const cur = scaleRef.current
      const next = Math.min(2.5, Math.max(0.25, cur * factor))
      const rect = el.getBoundingClientRect()
      scaleRef.current = next
      setScale(next)
      setOffset(o => ({
        x: (e.clientX - rect.left) - (next / cur) * ((e.clientX - rect.left) - o.x),
        y: (e.clientY - rect.top)  - (next / cur) * ((e.clientY - rect.top)  - o.y),
      }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!lessonId) return
    if (!mountedRef.current) { mountedRef.current = true; return }
    const t = setTimeout(() =>
      localStorage.setItem(CANVAS_LS(lessonId), JSON.stringify({ nodes, offset, scale })), 80)
    return () => clearTimeout(t)
  }, [lessonId, nodes, offset, scale])

  useEffect(() => {
    if (!onNodesChange) return
    const t = setTimeout(() => onNodesChange(nodes), 500)
    return () => clearTimeout(t)
  }, [nodes, onNodesChange])

  function addNode() {
    const el = boardRef.current
    const rect = el ? el.getBoundingClientRect() : { width: 900, height: 600 }
    const cx = (rect.width  / 2 - offset.x) / scale - 91 + (Math.random() - 0.5) * 60
    const cy = (rect.height / 2 - offset.y) / scale - 20 + (Math.random() - 0.5) * 60
    setNodes(prev => renumber([...prev, makeNode(prev.length + 1, cx, cy)]))
  }

  // Кнопки шапки (CanvasPage) дотягиваются сюда через ref — nodes/offset/scale
  // живут в этом компоненте, поднимать их в CanvasPage ради двух кнопок смысла нет
  useImperativeHandle(ref, () => ({
    clearAll() {
      if (!window.confirm('Удалить ВСЕ ноды урока? Это нельзя отменить.')) return
      setNodes([])
    },
    focusStart() {
      const first = nodes.slice().sort((a, b) => a.seq - b.seq)[0]
      if (!first) return
      const el = boardRef.current
      const rect = el ? el.getBoundingClientRect() : { width: 900, height: 600 }
      scaleRef.current = 1
      setScale(1)
      setOffset({ x: rect.width / 2 - first.x - 91, y: rect.height / 2 - first.y - 20 })
    },
  }), [nodes])

  const svgTransform   = `translate(${offset.x},${offset.y}) scale(${scale})`
  const worldTransform = `translate(${offset.x}px,${offset.y}px) scale(${scale})`

  return (
    <div
      ref={boardRef}
      className="canvasBoard"
      style={{ cursor: portDrag ? 'crosshair' : undefined, userSelect: portDrag ? 'none' : undefined }}
      onMouseDown={e => {
        // Клик вне ноды и меню закрывает меню-липучку (и вопрос «Удалить?»)
        if (!e.target.closest?.('.canvasNodeWrapper')) {
          setHoveredNodeId(null)
          setConfirmDeleteId(null)
        }
        // Средняя кнопка — панорамирование холста (в т.ч. начатое над нодой,
        // см. handleNodeMouseDown). Левая по пустому месту — рамка выделения,
        // а не панорамирование (клики по нодам сюда не долетают — там
        // stopPropagation в handleNodeMouseDown)
        if (e.button === 1) {
          e.preventDefault()
          startCanvasDrag(e)
          return
        }
        if (e.button !== 0) return
        startMarquee(e, boardRef)
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg className="canvasBoardSvg canvasBoardSvgBack">
        <g transform={svgTransform}>
          <CanvasConnections
            nodes={nodes} portDrag={portDrag} onPortDragStart={startPortDrag}
            triggerMeasures={triggerMeasures} layer="back"
          />
        </g>
      </svg>

      <div className="canvasBoardWorld" style={{ transform: worldTransform, transformOrigin: '0 0' }}>
        {nodes.map(node => (
          <div
            key={node.id}
            className="canvasNodeWrapper"
            style={{ left: node.x, top: node.y }}
            onMouseEnter={() => enterNode(node.id)}
          >
            <CanvasNode
              node={node}
              onUpdate={patch => updateNode(node.id, patch)}
              onDragStart={e => handleNodeMouseDown(node.id, e)}
              selected={selectedIds.has(node.id)}
              wasDragged={wasDragged}
              allNodes={nodes}
              lessonFiles={lessonFiles}
              onPickLessonFile={onPickLessonFile}
              onTriggerMeasure={offsets => handleTriggerMeasure(node.id, offsets)}
              moduleLessons={moduleLessons}
            />
            {hoveredNodeId === node.id && (
              <div
                className="nodeHoverMenu"
                onMouseDown={e => e.stopPropagation()}
              >
                {confirmDeleteId === node.id ? (
                  <>
                    <span className="nodeHoverConfirm">Удалить?</span>
                    <button className="nodeHoverBtn nodeHoverBtnDel"
                      onClick={e => { e.stopPropagation(); deleteNode(node.id) }}>Да</button>
                    <button className="nodeHoverBtn"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(null) }}>Нет</button>
                  </>
                ) : (
                  <>
                    <button className="nodeHoverBtn nodeHoverBtnDel" title="Удалить ноду"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(node.id) }}>×</button>
                    <button className="nodeHoverBtn nodeHoverBtnDup" title="Дублировать ноду"
                      onClick={e => { e.stopPropagation(); duplicateNode(node.id) }}>⧉</button>
                    <button className="nodeHoverBtn nodeHoverBtnAdd" title="Вставить ноду после"
                      onClick={e => { e.stopPropagation(); insertAfterNode(node.id) }}>+</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <svg className="canvasBoardSvg canvasBoardSvgFront">
        <g transform={svgTransform}>
          <CanvasConnections
            nodes={nodes} portDrag={portDrag} onPortDragStart={startPortDrag}
            triggerMeasures={triggerMeasures} layer="front"
          />
        </g>
      </svg>

      {marquee && (
        <div
          className="canvasMarquee"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      <button className="canvasAddBtn" onClick={addNode}>+ Нода</button>
    </div>
  )
})

export default CanvasBoard
