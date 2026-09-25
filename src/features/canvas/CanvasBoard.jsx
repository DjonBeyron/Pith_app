import { useState, useEffect, useMemo, useCallback, forwardRef } from 'react'
import CanvasBoardNode from './CanvasBoardNode.jsx'
import CanvasConnections from './CanvasConnections.jsx'
import CanvasSignalConnections from './CanvasSignalConnections.jsx'
import { collectSignalTargetIds } from './signalTargets.js'
import { nodeOptionsSignature, pickNodeOptions } from './canvasNodeOptions.js'
import { releaseTextSelection } from './canvasDragGuard.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { useCanvasDrag } from './useCanvasDrag.js'
import { useCanvasHover } from './useCanvasHover.js'
import { useCanvasSelection } from './useCanvasSelection.js'
import { useCanvasNodeOps } from './useCanvasNodeOps.js'
import { useCanvasBoardState } from './useCanvasBoardState.js'
import { useCanvasPortDrag } from './useCanvasPortDrag.js'
import { useCanvasSignalPortDrag } from './useCanvasSignalPortDrag.js'
import { renumber } from './nodeGraph.js'
import { addCenterNode } from './addCenterNode.js'
import { useCanvasBoardApi } from './useCanvasBoardApi.js'
import { useCanvasZoom } from './useCanvasZoom.js'
import { useCanvasTouch } from './useCanvasTouch.js'
import { FAR_ZOOM } from './canvasZoom.js'
import CanvasBoardChrome from './CanvasBoardChrome.jsx'
import { useBoardRect } from './useBoardRect.js'
import { useCanvasGroupDelete } from './useCanvasGroupDelete.js'
import CanvasLinkDebug, { CanvasDebugOverlay } from './CanvasLinkDebug.jsx'
import { linkDiagnostics } from './canvasLinkDebug.js'
import { useLinkDebugLog } from './useLinkDebugLog.js'
import { useNodeNotes } from './useNodeNotes.js'
import { useLocalNoteBox } from './useLocalNoteBox.js'
import { computeMenuPos } from '../../shared/lib/menuPosition.js'
import { isNodeDimmed } from './nodeMediaStatus.js'
import ZonesLayer from './zones/ZonesLayer.jsx'
import { useZoneToolIntegration } from './zones/useZoneToolIntegration.js'
import { useCanvasBoardPointer } from './useCanvasBoardPointer.js'

// Стабильная ссылка для allNodes у mini/nano нод (см. рендер ниже) — тем,
// у кого нет дропдаунов со списком других нод, не нужен реальный список.
// Если передавать им {nodes} напрямую, React.memo на CanvasNode срывался бы
// при любой правке ЛЮБОЙ ноды урока (новый массив — новая ссылка), даже
// когда рядом просто печатают текст в другой ноде — именно это и вызывало
// подтормаживание на нагруженных графах.
const EMPTY_NODES = []

const CanvasBoard = forwardRef(function CanvasBoard({
  initialNodes, lessonFiles = [], onPickLessonFile, onRemoveLessonFile, lessonId, onNodesChange,
  moduleLessons = [],
  onPlayFrom, // админ: прогнать сценарий начиная с этой ноды
  // Фильтр в шапке (админ): типы, которые показываем в полную силу.
  // Пустой набор — фильтр выключен, видно всё
  visibleTypes = null,
  // Особый фильтр: в полную силу только ноды, которым ещё не загрузили файл
  onlyMissingMedia = false,
  // Отладка связей (меню «⋯»): прямые отрезки поверх всего + сводка
  debugLinks = false,
  lessonXp = 0,
  // Зоны — визуальная группировка нод на холсте автора (см. zones/), не
  // часть сценария урока. Инструмент включается кнопкой шапки (CanvasPage) и
  // сам себя выключает после того, как автор нарисовал одну зону
  initialZones = [],
  onZonesChange,
  zoneToolActive = false,
  onZoneToolDone,
}, ref) {
  // Ноды/зоны/offset/scale + вся локальная персистентность (черновик, сверка
  // с сервером, память позиции обзора) — useCanvasBoardState.js
  const { nodes, setNodes, zones, setZones, offset, setOffset, scale, setScale, scaleRef } =
    useCanvasBoardState(lessonId, initialNodes, initialZones, onNodesChange, onZonesChange)

  const [triggerMeasures, setTriggerMeasures] = useState({})
  // Кнопка «пройти с этой ноды» в меню ноды — только для админа, это
  // инструмент проверки сценария, а не часть урока
  const { isAdmin } = useAdmin()
  // Меню выбора типа при создании ноды: открывается по «+» в меню ноды и по
  // клику на выходной кружок. { pos, nodeId, triggerIdx } — triggerIdx задан,
  // когда создаём с конкретного выхода развилки
  const [typeMenu, setTypeMenu] = useState(null)

  // Доска и кэш её прямоугольника (+ measureBoard перед протяжкой) — useBoardRect.js
  const { boardRef, boardRectRef, measureBoard } = useBoardRect()

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

  // Выделение нескольких нод (рамкой по левой кнопке или Shift+клик) —
  // протяжка за любую из выделенных двигает всю группу разом (moveNode)
  const {
    selectedIds, marquee, moveGroup, selectOnly, clearSelection,
    onNodeMouseDown: onSelectionMouseDown, startMarquee, updateMarquee, endMarquee, collapseIfClick,
  } = useCanvasSelection()

  // patch — объект ИЛИ функция (node)=>объект (функциональный setState) —
  // нужна для нод, патчащихся в несколько приёмов подряд, см. PROJECT.md
  // «Гонка обновлений typeData». renumber: патч мог поменять триггеры → граф
  const updateNode = useCallback((id, patch) =>
    setNodes(prev => renumber(prev.map(n =>
      n.id === id ? { ...n, ...(typeof patch === 'function' ? patch(n) : patch) } : n))), [setNodes])

  // Тянем одну ноду — двигается она одна; тянем ноду из группового выделения
  // (2+ нод) — двигается вся группа на тот же dx/dy
  const moveNode = useCallback((id, dx, dy) =>
    setNodes(prev => {
      const group = moveGroup(id)
      return prev.map(n => group.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)
    }), [moveGroup, setNodes])

  // Комментарии продакшена: что свёрнуто — useNodeNotes.js; куда подвинут
  // стикер — useLocalNoteBox.js (это личное, живёт в браузере, не в уроке)
  const { toggleNote, isNoteOpen, isNoteFolded } = useNodeNotes(updateNode)
  const { boxFor, setBoxFor, clearBoxFor } = useLocalNoteBox()

  const pan = useCallback((dx, dy) =>
    setOffset(o => ({ x: o.x + dx, y: o.y + dy })), [setOffset])

  const { deleteNode: deleteNodeOp, deleteNodes: deleteNodesOp, duplicateNode, duplicateDetached, insertAfterNode, insertFromPort, insertSignalFromPort } =
    useCanvasNodeOps(setNodes)
  const { confirmGroupDelete, askGroupDelete, cancelGroupDelete, deleteSelectedGroup } =
    useCanvasGroupDelete(selectedIds, deleteNodesOp, clearSelection)

  // Shift+протяжка ноды за шапку — копия ноды «без связей» отрывается от
  // оригинала и едет за курсором (как копирование файла протяжкой в
  // проводнике). Выделяем сразу её: тянуть должна копия, а не старая группа
  function duplicateForDrag(nodeId) {
    const copyId = duplicateDetached(nodeId)
    selectOnly(copyId)
    return copyId
  }

  const { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged, nodeDragging } =
    useCanvasDrag({ onNodeMove: moveNode, onNodeDuplicate: duplicateForDrag, onPan: pan, scaleRef })

  // Наведение на ноду, липучее меню и вопрос «Удалить?» — useCanvasHover.js
  const { hoveredNodeId, setHoveredNodeId, confirmDeleteId, setConfirmDeleteId, enterNode } =
    useCanvasHover(nodeDragging)

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

  // Цели сигналов ошибок (signals[].ref) — красная шапка ноды на холсте
  const signalTargetIds = useMemo(() => collectSignalTargetIds(nodes), [nodes])

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
  }, [offset, scale, boardRectRef])

  // Протяжка соединения от выходного кружка ноды — useCanvasPortDrag.js
  const { portDrag, startPortDrag, handlePortMouseMove, handlePortMouseUp } =
    useCanvasPortDrag({ nodes, triggerMeasures, toWorld, setNodes, setTypeMenu, measureBoard })
  // То же для портов сигналов (слот table/phrase_assembly) — useCanvasSignalPortDrag.js
  const { signalMeasures, handleSignalMeasure, signalDrag, startSignalDrag, handleSignalMouseMove, handleSignalMouseUp } =
    useCanvasSignalPortDrag({ nodes, triggerMeasures, toWorld, setNodes, setTypeMenu, measureBoard })

  // Инструмент «Зона» + CRUD над зонами — useZoneToolIntegration.js (нужен
  // только setZones, логика геометрии — в zones/zoneOps.js)
  const { zoneDraft, tryStartZoneDraw, tryUpdateZoneDraw, tryEndZoneDraw,
    updateZoneRect, updateZoneLabel, deleteZone } =
    useZoneToolIntegration({ zoneToolActive, toWorld, setZones, onZoneToolDone })

  // Три обработчика мыши доски (mousedown/move/up по пустому месту) —
  // useCanvasBoardPointer.js: порядок проверок порт → зона → рамка → протяжка
  const { handleBoardMouseDown, handleBoardMouseMove, handleBoardMouseUp } = useCanvasBoardPointer({
    toWorld, boardRectRef, measureBoard, nodes,
    setHoveredNodeId, setConfirmDeleteId,
    startCanvasDrag, startMarquee, updateMarquee, endMarquee,
    handlePortMouseMove, handlePortMouseUp, handleSignalMouseMove, handleSignalMouseUp,
    tryStartZoneDraw, tryUpdateZoneDraw, tryEndZoneDraw,
    onDragMouseMove: onMouseMove, endDrag, wasDragged, collapseIfClick,
  })

  // Зум колесом/пинчем — точка под курсором остаётся под курсором
  const resetZoom = useCanvasZoom(boardRef, boardRectRef, scaleRef, setScale, setOffset)
  // Пальцы: панорама одним, щипок двумя — на телефоне мыши и колеса нет
  useCanvasTouch(boardRef, boardRectRef, scaleRef, setScale, setOffset)

  function addNode() {
    addCenterNode({ boardRef, offset, scale, setNodes })
  }

  // Команды холсту снаружи (кнопки шапки, правая панель плеера) + «прожектор»
  // на ноде, к которой перешли из плеера
  const spotlightId = useCanvasBoardApi(ref, {
    nodes, setNodes, zones, setZones, updateNode, selectOnly, boardRef, scaleRef, setScale, setOffset, onRemoveLessonFile,
  })

  // Считается только когда отладка включена — на обычной работе холста ноль
  // Сводка по связям уходит в лог сама — см. useLinkDebugLog.js
  useLinkDebugLog(nodes, triggerMeasures, scaleRef, debugLinks)

  const linkDebug = debugLinks ? linkDiagnostics(nodes, triggerMeasures) : null

  // Дальний зум: содержимое нод и точки портов не рисуем — подробности
  // у FAR_ZOOM в canvasZoom.js
  const far = scale < FAR_ZOOM
  const svgTransform   = `translate(${offset.x},${offset.y}) scale(${scale})`
  const worldTransform = `translate(${offset.x}px,${offset.y}px) scale(${scale})`

  return (
    <div
      ref={boardRef}
      className={`canvasBoard${spotlightId ? ' canvasSpotlight' : ''}`}
      style={{
        cursor: (portDrag || zoneToolActive) ? 'crosshair' : undefined,
        userSelect: portDrag ? 'none' : undefined,
      }}
      onMouseDown={handleBoardMouseDown}
      onMouseMove={handleBoardMouseMove}
      onMouseUp={handleBoardMouseUp}
      onMouseLeave={handleBoardMouseUp}
    >
      <svg className="canvasBoardSvg canvasBoardSvgBack">
        <g transform={svgTransform}>
          <CanvasConnections
            nodes={nodes} portDrag={portDrag} onPortDragStart={startPortDrag}
            triggerMeasures={triggerMeasures} layer="back" far={far}
            hoveredNodeId={nodeDragging ? null : hoveredNodeId}
          />
        </g>
      </svg>

      <ZonesLayer
        zones={zones}
        draft={zoneDraft}
        worldTransform={worldTransform}
        scaleRef={scaleRef}
        scale={scale}
        onChange={updateZoneRect}
        onLabelChange={updateZoneLabel}
        onDelete={deleteZone}
      />

      <div className={`canvasBoardWorld${far ? ' canvasBoardWorldFar' : ''}`}
        style={{ transform: worldTransform, transformOrigin: '0 0' }}>
        {nodes.map(node => (
          <CanvasBoardNode
            key={node.id}
            node={node}
            spot={spotlightId === node.id}
            selected={selectedIds.has(node.id)}
            hovered={hoveredNodeId === node.id}
            confirmDelete={confirmDeleteId === node.id}
            isAdmin={isAdmin}
            onEnter={() => enterNode(node.id)}
            onUpdate={updateNode}
            onDragStart={handleNodeMouseDown}
            wasDragged={wasDragged}
            allNodes={node.size === 'max' ? nodeOptions : EMPTY_NODES}
            lessonFiles={lessonFiles}
            onPickLessonFile={onPickLessonFile}
            onRemoveLessonFile={onRemoveLessonFile}
            lessonXp={lessonXp}
            onTriggerMeasure={handleTriggerMeasure} onSignalMeasure={handleSignalMeasure}
            moduleLessons={moduleLessons}
            dimmed={isNodeDimmed(node, visibleTypes, onlyMissingMedia)}
            isSignalTarget={signalTargetIds.has(node.id)}
            noteBox={boxFor(node.id)}
            onNoteBoxChange={box => setBoxFor(node.id, box)}
            onNoteBoxClear={() => clearBoxFor(node.id)}
            scaleRef={scaleRef}
            noteFolded={isNoteFolded(node)}
            noteOpen={isNoteOpen(node)}
            onFoldNote={() => toggleNote(node.id, true)}
            onToggleNote={() => toggleNote(node.id, node.note != null)}
            onPlayFrom={onPlayFrom ? () => onPlayFrom(node.id) : null}
            onAdd={e => setTypeMenu({
              pos: computeMenuPos(e.currentTarget.getBoundingClientRect()),
              nodeId: node.id,
            })}
            onDuplicate={() => duplicateNode(node.id)}
            onAskDelete={() => setConfirmDeleteId(node.id)}
            onDelete={() => deleteNode(node.id)}
            onCancelDelete={() => setConfirmDeleteId(null)}
          />
        ))}
      </div>

      <svg className="canvasBoardSvg canvasBoardSvgFront">
        <g transform={svgTransform}>
          <CanvasConnections
            nodes={nodes} portDrag={portDrag} onPortDragStart={startPortDrag}
            triggerMeasures={triggerMeasures} layer="front" far={far}
            hoveredNodeId={nodeDragging ? null : hoveredNodeId}
          />
          <CanvasSignalConnections nodes={nodes} triggerMeasures={triggerMeasures}
            signalMeasures={signalMeasures} signalDrag={signalDrag} onSignalDragStart={startSignalDrag} />
          {linkDebug && <CanvasLinkDebug segments={linkDebug.segments} />}
        </g>
      </svg>

      {linkDebug && (
        <CanvasDebugOverlay debug={linkDebug} scale={scale} offset={offset} />
      )}

      <CanvasBoardChrome
        scale={scale} onResetZoom={resetZoom}
        selection={{ count: selectedIds.size, confirming: confirmGroupDelete,
          onAskDelete: askGroupDelete, onDelete: deleteSelectedGroup, onCancel: cancelGroupDelete }}
        typeMenu={typeMenu} setTypeMenu={setTypeMenu}
        insertFromPort={insertFromPort} insertSignalFromPort={insertSignalFromPort} insertAfterNode={insertAfterNode}
        marquee={marquee} onAddNode={addNode}
      />
    </div>
  )
})

export default CanvasBoard
