import { useState, useRef, useEffect, useCallback } from 'react'
import { canvasLsKey } from './canvasStorageKeys.js'
import CanvasNode from './CanvasNode.jsx'
import CanvasConnections from './CanvasConnections.jsx'
import { nodeEntry } from './canvasPorts.js'
import { makeDefaultTriggers, getLastNodeType } from './nodeDefaults.js'
import { useCanvasDrag } from './useCanvasDrag.js'

// Радиус (в мировых координатах), в котором брошенный порт цепляется
// к входной точке ноды.
const SNAP_R = 40

// Порядковые номера следуют порядку графа: вход (нода без входящих связей) = #1,
// дальше — обход по триггерам. Несвязанные ноды идут после, в старом порядке.
function computeSeqMap(nodes) {
  const incoming = new Set()
  nodes.forEach(n => (n.triggers ?? []).forEach(t => { if (t.then) incoming.add(t.then) }))
  const byId  = Object.fromEntries(nodes.map(n => [n.id, n]))
  const bySeq = nodes.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const order = []
  const seen  = new Set()
  function visit(n) {
    if (!n || seen.has(n.id)) return
    seen.add(n.id)
    order.push(n.id)
    ;(n.triggers ?? []).forEach(t => visit(byId[t.then]))
  }
  bySeq.filter(n => !incoming.has(n.id)).forEach(visit) // корни графа
  bySeq.forEach(visit)                                  // циклы и осколки
  return new Map(order.map((id, i) => [id, i + 1]))
}

// Применяет перенумерацию к списку нод (без изменений — возвращает тот же массив)
function renumber(list) {
  const seqMap = computeSeqMap(list)
  if (list.every(n => seqMap.get(n.id) === n.seq)) return list
  return list.map(n => ({ ...n, seq: seqMap.get(n.id) }))
}

// Ключ черновика — в canvasStorageKeys.js (не здесь: этот файл не должен
// экспортировать ничего, кроме компонента, иначе ломается Fast Refresh).
// CanvasPage.handleSave чистит его сразу после успешного сохранения: черновик
// нужен только чтобы не терять НЕсохранённые правки при случайной
// перезагрузке страницы — s.nodes в loadSaved() ниже имеет приоритет над
// initialNodes при каждом монтировании, поэтому несброшенный черновик
// навсегда перекрывал бы настоящие данные с сервера
const CANVAS_LS = canvasLsKey

function makeNode(seq, x, y) {
  // Новая нода наследует последний выбранный тип и его дефолтный триггер
  const type = getLastNodeType()
  return {
    id: crypto.randomUUID(),
    seq,
    x,
    y,
    size: 'max',
    type,
    triggers: makeDefaultTriggers(type),
    typeData: {
      audio:       { file_id: null },
      photo:       { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      video:       { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      circle:      { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      text:        { content: '', replyToSeq: null },
      word_choice:     { options: [], responseCorrect: '', responseWrong: '' },
      phrase_assembly: { words: [], distractors: [], responseCorrect: '', responseWrong: '', replyToSeq: null },
      pin_message:     { content: '' },
      system:          { content: '' },
      sticker:         { file_id: null, crop: { x: 0, y: 0, scale: 1 }, muted: true, isVideo: false, replyToSeq: null },
      photo_choice:    { photos: [], correctIndexes: [], responseCorrect: '', responseWrong: '' },
    },
  }
}

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

export default function CanvasBoard({
  initialNodes, lessonFiles = [], onPickLessonFile, lessonId, onNodesChange,
  moduleLessons = [],
}) {
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

  const updateNode = useCallback((id, patch) =>
    // renumber: патч мог изменить триггеры → порядок графа
    setNodes(prev => renumber(prev.map(n => n.id === id ? { ...n, ...patch } : n))), [])

  const moveNode = useCallback((id, dx, dy) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)), [])

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


  function deleteNode(nodeId) {
    setHoveredNodeId(null)
    setConfirmDeleteId(null)
    setNodes(prev => renumber(
      prev
        .filter(n => n.id !== nodeId)
        .map(n => ({
          ...n,
          triggers: n.triggers.map(t => ({ ...t, then: t.then === nodeId ? null : t.then })),
        }))
    ))
  }

  // Шаг сетки: ширина max-ноды + зазор. Столько же занимает новая нода.
  const NODE_SLOT = 260

  // Освобождает место под новую ноду: всё, что правее x, уезжает на слот вправо
  function shiftRight(list, x) {
    return list.map(n => n.x > x ? { ...n, x: n.x + NODE_SLOT } : n)
  }

  // Дубликат встраивается в цепочку сразу после оригинала: все выходы оригинала
  // переключаются на копию, копия наследует прежние выходы. Вход остаётся на
  // оригинале: A → B → B' → C. Номера пересчитывает renumber, соседи справа
  // сдвигаются, освобождая место.
  function duplicateNode(nodeId) {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const copy = {
        ...node,
        id: crypto.randomUUID(),
        x: node.x + NODE_SLOT,
        y: node.y,
        typeData: structuredClone(node.typeData ?? {}),
        triggers: (node.triggers ?? []).map(t => ({ ...t, id: crypto.randomUUID() })),
      }
      const updated = shiftRight(prev, node.x).map(n => n.id !== nodeId ? n : {
        ...n,
        triggers: n.triggers.map(t => t.then ? { ...t, then: copy.id } : t),
      })
      return renumber([...updated, copy])
    })
  }

  function insertAfterNode(nodeId) {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const insertSeq = node.seq + 1
      const nextNode  = prev.find(n => n.seq === insertSeq) ?? null
      const newNode   = makeNode(insertSeq, node.x + NODE_SLOT, node.y)
      // middle insert: новая нода ведёт на следующую своим первым триггером
      if (nextNode) {
        newNode.triggers = newNode.triggers.map((t, ti) =>
          ti === 0 ? { ...t, then: nextNode.id } : t)
      }
      const updated = shiftRight(prev, node.x).map(n => {
        let out = n.seq >= insertSeq ? { ...n, seq: n.seq + 1 } : n
        if (n.id === nodeId) {
          if (nextNode) {
            // middle insert: rewire existing trigger A→B to A→new→B
            out = { ...out, triggers: out.triggers.map(t => ({
              ...t, then: t.then === nextNode.id ? newNode.id : t.then,
            }))}
          } else {
            // tail insert: заполняем первый свободный триггер ноды (у word_choice /
            // phrase_assembly / photo_choice свои пары correct/wrong — чужой 'played'
            // добавлял бы лишний порт). Только если все заняты — добавляем 'played'.
            const freeIdx = out.triggers.findIndex(t => !t.then)
            out = freeIdx >= 0
              ? { ...out, triggers: out.triggers.map((t, ti) =>
                  ti === freeIdx ? { ...t, then: newNode.id } : t) }
              : { ...out, triggers: [...out.triggers, { if: 'played', then: newNode.id }] }
          }
        }
        return out
      })
      return renumber([...updated, newNode])
    })
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
    onMouseMove(e)
  }

  function handleMouseUp(e) {
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
      localStorage.setItem(CANVAS_LS(lessonId), JSON.stringify({ nodes, offset, scale })), 400)
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
        startCanvasDrag(e)
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
              onDragStart={e => startNodeDrag(node.id, e)}
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

      <button className="canvasAddBtn" onClick={addNode}>+ Нода</button>
    </div>
  )
}
