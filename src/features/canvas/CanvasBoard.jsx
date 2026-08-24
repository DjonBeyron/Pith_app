import { useState, useRef, useEffect, useMemo, useCallback, forwardRef } from 'react'
import CanvasNode from './CanvasNode.jsx'
import CanvasConnections from './CanvasConnections.jsx'
import { nodeOptionsSignature, pickNodeOptions } from './canvasNodeOptions.js'
import { releaseTextSelection } from './canvasDragGuard.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { useCanvasDrag } from './useCanvasDrag.js'
import { useCanvasSelection } from './useCanvasSelection.js'
import { useCanvasNodeOps } from './useCanvasNodeOps.js'
import { useCanvasBoardState } from './useCanvasBoardState.js'
import { useCanvasPortDrag } from './useCanvasPortDrag.js'
import { renumber, makeNode } from './nodeGraph.js'
import { useCanvasBoardApi } from './useCanvasBoardApi.js'
import NodeTypeMenu from './NodeTypeMenu.jsx'
import { computeMenuPos } from '../../shared/lib/menuPosition.js'
import { isNodeDimmed } from './nodeMediaStatus.js'
import { NODE_HIT_W, NODE_HIT_H } from './canvasHitTest.js'

// Стабильная ссылка для allNodes у mini/nano нод (см. рендер ниже) — тем,
// у кого нет дропдаунов со списком других нод, не нужен реальный список.
// Если передавать им {nodes} напрямую, React.memo на CanvasNode срывался бы
// при любой правке ЛЮБОЙ ноды урока (новый массив — новая ссылка), даже
// когда рядом просто печатают текст в другой ноде — именно это и вызывало
// подтормаживание на нагруженных графах.
const EMPTY_NODES = []

const CanvasBoard = forwardRef(function CanvasBoard({
  initialNodes, lessonFiles = [], onPickLessonFile, lessonId, onNodesChange,
  moduleLessons = [],
  onPlayFrom, // админ: прогнать сценарий начиная с этой ноды
  // Фильтр в шапке (админ): типы, которые показываем в полную силу.
  // Пустой набор — фильтр выключен, видно всё
  visibleTypes = null,
  // Особый фильтр: в полную силу только ноды, которым ещё не загрузили файл
  onlyMissingMedia = false,
}, ref) {
  // Ноды/offset/scale + вся локальная персистентность (черновик, сверка
  // с сервером, память позиции обзора) — useCanvasBoardState.js
  const { nodes, setNodes, offset, setOffset, scale, setScale, scaleRef } =
    useCanvasBoardState(lessonId, initialNodes, onNodesChange)

  const [triggerMeasures, setTriggerMeasures] = useState({})
  // Кнопка «пройти с этой ноды» в меню ноды — только для админа, это
  // инструмент проверки сценария, а не часть урока
  const { isAdmin } = useAdmin()
  const [hoveredNodeId,  setHoveredNodeId]  = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  // Меню выбора типа при создании ноды: открывается по «+» в меню ноды и по
  // клику на выходной кружок. { pos, nodeId, triggerIdx } — triggerIdx задан,
  // когда создаём с конкретного выхода развилки
  const [typeMenu, setTypeMenu] = useState(null)

  const boardRef     = useRef(null)
  // Кэш getBoundingClientRect() холста — сам вызов синхронно форсирует layout
  // браузера; на колесе мыши/протяжке порта он летел на КАЖДОЕ событие
  // (зум трекпадом — десятки-сотни событий подряд), что и давало рваное,
  // дёрганое движение. Меряем один раз и обновляем только когда РЕАЛЬНО
  // может измениться геометрия — на resize и когда меняется высота/позиция
  // самого холста (ResizeObserver — например когда над ним появляется/
  // исчезает строка синхронизации в CanvasPage.jsx)
  const boardRectRef = useRef({ left: 0, top: 0 })

  // Мышь могли отпустить за пределами холста — тогда handleMouseUp доски не
  // сработает, а запрет наведения/кликов остался бы висеть на body
  useEffect(() => {
    window.addEventListener('mouseup', releaseTextSelection)
    window.addEventListener('blur', releaseTextSelection)
    return () => {
      window.removeEventListener('mouseup', releaseTextSelection)
      window.removeEventListener('blur', releaseTextSelection)
    }
  }, [])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    function measure() { boardRectRef.current = el.getBoundingClientRect() }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  // Выделение нескольких нод (рамкой по левой кнопке или Shift+клик) —
  // протяжка за любую из выделенных двигает всю группу разом (moveNode)
  const {
    selectedIds, marquee, moveGroup, selectOnly,
    onNodeMouseDown: onSelectionMouseDown, startMarquee, updateMarquee, endMarquee, collapseIfClick,
  } = useCanvasSelection()

  const updateNode = useCallback((id, patch) =>
    // renumber: патч мог изменить триггеры → порядок графа
    setNodes(prev => renumber(prev.map(n => n.id === id ? { ...n, ...patch } : n))), [setNodes])

  // Тянем одну ноду — двигается она одна; тянем ноду из группового выделения
  // (2+ нод) — двигается вся группа на тот же dx/dy
  const moveNode = useCallback((id, dx, dy) =>
    setNodes(prev => {
      const group = moveGroup(id)
      return prev.map(n => group.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)
    }), [moveGroup, setNodes])

  const pan = useCallback((dx, dy) =>
    setOffset(o => ({ x: o.x + dx, y: o.y + dy })), [setOffset])

  const { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged, nodeDragging } =
    useCanvasDrag({ onNodeMove: moveNode, onPan: pan, scaleRef })

  // Список нод для дропдаунов внутри max-нод («Тогда → нода #N», «В ответ
  // на»). Им нужны только id/seq/type/typeData, но не координаты — а раньше
  // сюда шёл сам массив nodes, который при протяжке пересоздаётся каждый
  // кадр. Из-за этого React.memo срывался у ВСЕХ max-нод разом, и на каждое
  // движение мыши перерисовывались все поля, списки и триггеры графа.
  // Ссылка меняется только когда реально поменялся состав или содержимое.
  const optionsSig = nodeOptionsSignature(nodes)
  const nodeOptions = useMemo(
    () => pickNodeOptions(nodes),
    [optionsSig], // eslint-disable-line react-hooks/exhaustive-deps
  )

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
    // Во время протяжки нода проезжает под курсором мимо соседей — их меню
    // не должны мигать, а лишний setState на каждом кадре ни к чему
    if (nodeDragging) return
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


  const { deleteNode: deleteNodeOp, duplicateNode, insertAfterNode, insertFromPort } = useCanvasNodeOps(setNodes)

  function deleteNode(nodeId) {
    setHoveredNodeId(null)
    setConfirmDeleteId(null)
    deleteNodeOp(nodeId)
  }

  // useCallback — проп до CanvasNode.jsx (React.memo)
  const handleNodeMouseDown = useCallback((nodeId, e) => {
    onSelectionMouseDown(nodeId, e, { startNodeDrag, startCanvasDrag })
  }, [onSelectionMouseDown, startNodeDrag, startCanvasDrag])

  // useCallback — startPortDrag от неё зависит, а он проп CanvasConnections
  // (React.memo): без этого наведение на любую ноду (hoveredNodeId) заново
  // пересчитывало бы ВСЕ бэзье-линии графа, а не только то, что реально
  // изменилось
  const toWorld = useCallback((clientX, clientY) => {
    const rect = boardRectRef.current
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top  - offset.y) / scale,
    }
  }, [offset, scale])

  // Протяжка соединения от выходного кружка ноды — useCanvasPortDrag.js
  const { portDrag, startPortDrag, handlePortMouseMove, handlePortMouseUp } =
    useCanvasPortDrag({ nodes, triggerMeasures, toWorld, setNodes, setTypeMenu })

  function handleMouseMove(e) {
    if (handlePortMouseMove(e)) return
    const hitSize = n => ({ w: NODE_HIT_W[n.size] ?? 158, h: NODE_HIT_H[n.size] ?? 200 })
    if (updateMarquee(e, () => boardRectRef.current, toWorld, nodes, hitSize)) return
    onMouseMove(e)
  }

  function handleMouseUp(e) {
    // Снимаем запрет выделения ЗДЕСЬ, а не в endDrag: у рамки и у протяжки
    // порта свои ранние выходы ниже, и класс на body остался бы висеть после
    // них навсегда — текст в нодах перестал бы выделяться вообще
    releaseTextSelection()
    if (endMarquee()) return
    if (handlePortMouseUp(e)) return
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
      const rect = boardRectRef.current
      scaleRef.current = next
      setScale(next)
      setOffset(o => ({
        x: (e.clientX - rect.left) - (next / cur) * ((e.clientX - rect.left) - o.x),
        y: (e.clientY - rect.top)  - (next / cur) * ((e.clientY - rect.top)  - o.y),
      }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addNode() {
    const el = boardRef.current
    const rect = el ? el.getBoundingClientRect() : { width: 900, height: 600 }
    const cx = (rect.width  / 2 - offset.x) / scale - 91 + (Math.random() - 0.5) * 60
    const cy = (rect.height / 2 - offset.y) / scale - 20 + (Math.random() - 0.5) * 60
    setNodes(prev => renumber([...prev, makeNode(prev.length + 1, cx, cy)]))
  }

  // Команды холсту снаружи (кнопки шапки, правая панель плеера) + «прожектор»
  // на ноде, к которой перешли из плеера
  const spotlightId = useCanvasBoardApi(ref, {
    nodes, setNodes, updateNode, selectOnly, boardRef, scaleRef, setScale, setOffset,
  })

  const svgTransform   = `translate(${offset.x},${offset.y}) scale(${scale})`
  const worldTransform = `translate(${offset.x}px,${offset.y}px) scale(${scale})`

  return (
    <div
      ref={boardRef}
      className={`canvasBoard${spotlightId ? ' canvasSpotlight' : ''}`}
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
        startMarquee(e, () => boardRectRef.current)
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
            hoveredNodeId={nodeDragging ? null : hoveredNodeId}
          />
        </g>
      </svg>

      <div className="canvasBoardWorld" style={{ transform: worldTransform, transformOrigin: '0 0' }}>
        {nodes.map(node => (
          <div
            key={node.id}
            className={`canvasNodeWrapper${spotlightId === node.id ? ' canvasNodeWrapperSpot' : ''}`}
            style={{ left: node.x, top: node.y }}
            onMouseEnter={() => enterNode(node.id)}
          >
            <CanvasNode
              node={node}
              onUpdate={updateNode}
              onDragStart={handleNodeMouseDown}
              selected={selectedIds.has(node.id)}
              wasDragged={wasDragged}
              allNodes={node.size === 'max' ? nodeOptions : EMPTY_NODES}
              lessonFiles={lessonFiles}
              onPickLessonFile={onPickLessonFile}
              onTriggerMeasure={handleTriggerMeasure}
              moduleLessons={moduleLessons}
              dimmed={isNodeDimmed(node, visibleTypes, onlyMissingMedia)}
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
                    {isAdmin && onPlayFrom && (
                      <button className="nodeHoverBtn nodeHoverBtnPlay" title="Пройти сценарий с этой ноды"
                        onClick={e => { e.stopPropagation(); onPlayFrom(node.id) }}>▶</button>
                    )}
                    <button className="nodeHoverBtn nodeHoverBtnAdd" title="Вставить ноду после"
                      onClick={e => {
                        e.stopPropagation()
                        setTypeMenu({
                          pos: computeMenuPos(e.currentTarget.getBoundingClientRect()),
                          nodeId: node.id,
                        })
                      }}>+</button>
                    <button className="nodeHoverBtn nodeHoverBtnDup" title="Дублировать ноду"
                      onClick={e => { e.stopPropagation(); duplicateNode(node.id) }}>⧉</button>
                    <button className="nodeHoverBtn nodeHoverBtnDel" title="Удалить ноду"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(node.id) }}>×</button>
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
            hoveredNodeId={nodeDragging ? null : hoveredNodeId}
          />
        </g>
      </svg>

      <NodeTypeMenu
        pos={typeMenu?.pos}
        onClose={() => setTypeMenu(null)}
        onPick={type => {
          if (!typeMenu) return
          if (typeMenu.triggerIdx != null) insertFromPort(typeMenu.nodeId, typeMenu.triggerIdx, type)
          else insertAfterNode(typeMenu.nodeId, type)
          setTypeMenu(null)
        }}
      />

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
