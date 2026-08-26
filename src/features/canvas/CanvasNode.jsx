import { useEffect, memo } from 'react'
import NodeContentEditor from './NodeContentEditor.jsx'
import { applyTypeChange } from './nodeDefaults.js'
import NodeTypeSelect from './NodeTypeSelect.jsx'
import NodeMediaBadge from './NodeMediaBadge.jsx'
import { TYPE_COLOR, colorBg } from './nodeTypes.js'
import { isTextZone } from './canvasDragGuard.js'

const NEXT_SIZE = { nano: 'mini', mini: 'max', max: 'nano' }

// React.memo — на нагруженном графе (десятки-сотни нод) правка ОДНОЙ ноды
// (текст, drag, любое setNodes в CanvasBoard.jsx) раньше перерисовывала
// компонент КАЖДОЙ ноды на холсте, а не только изменившейся. Работает только
// если пропсы-функции стабильны между рендерами — см. CanvasBoard.jsx
// (onUpdate/onDragStart/onTriggerMeasure переданы как есть, без обёртки
// `patch => ...` на каждый рендер) и wasDragged (useCallback в useCanvasDrag.js).
// Пропсы здесь принимают nodeId первым аргументом — обёртка в замыкание
// happens здесь, локально, а не в CanvasBoard.jsx.
function CanvasNode({
  node, onUpdate, onDragStart, selected = false, wasDragged, allNodes, lessonFiles = [], onPickLessonFile, onTriggerMeasure,
  moduleLessons = [],
  // Фильтр в шапке канваса: тип не отмечен — нода приглушается, но остаётся
  // на месте и со своими связями
  dimmed = false,
}) {
  const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.text
  const handleUpdate = patch => onUpdate(node.id, patch)
  // Нажали ЛЕВОЙ в поле ввода/список — это работа с текстом: ноду не тащим и
  // курсор с выделением не отбираем. Всплытие всё равно гасим, иначе доска
  // приняла бы это за начало рамки выделения по пустому месту (CanvasBoard.jsx).
  // Средняя кнопка (панорама холста) и Shift (выделение группы, Shift+протяжка
  // = дубль ноды) работают и над полями — там текст ни при чём.
  const handleDragStart = e => {
    if (e.button === 0 && !e.shiftKey && isTextZone(e.target)) { e.stopPropagation(); return }
    onDragStart(node.id, e)
  }
  const handleTriggerMeasure = offsets => onTriggerMeasure?.(node.id, offsets)

  // When leaving max mode, clear stale trigger measurements so they don't
  // ghost onto the next max layout (e.g. after type switch or size cycle).
  // word_choice and phrase_assembly handle their own measurements via their pickers.
  useEffect(() => {
    if (node.size !== 'max') handleTriggerMeasure([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.size, onTriggerMeasure])

  const fileId = node.typeData?.[node.type]?.file_id ?? null

  function expandClick(e) {
    e.stopPropagation()
    if (wasDragged()) return
    handleUpdate({ size: NEXT_SIZE[node.size] })
  }

  // Смена типа пересобирает триггеры под дефолт нового типа (nodeDefaults.js) —
  // старые строки не тянутся за нодой и не дублируются. Тип запоминается для новых нод.
  function changeType(newType) {
    handleUpdate(applyTypeChange(node, newType))
  }

  // ── nano ────────────────────────────────────────────────────────
  if (node.size === 'nano') {
    return (
      <div
        className={`canvasNode canvasNodeNano${selected ? ' canvasNodeSelected' : ''}${dimmed ? ' canvasNodeDimmed' : ''}`}
        style={{ background: color }}
        onMouseDown={handleDragStart}
        onClick={expandClick}
      >
        <span className="canvasNodeSeq">{node.seq}</span>
        <NodeMediaBadge node={node} />
      </div>
    )
  }

  // ── mini ────────────────────────────────────────────────────────
  const miniFile = lessonFiles.find(f => f.id === fileId) ?? null

  if (node.size === 'mini') {
    return (
      <div className={`canvasNode canvasNodeMini${selected ? ' canvasNodeSelected' : ''}${dimmed ? ' canvasNodeDimmed' : ''}`} style={{ background: colorBg(color, 0.07) }} onMouseDown={handleDragStart}>
        <div className="canvasNodeTopBar" style={{ background: color }} />
        <NodeMediaBadge node={node} />
        <div className="canvasNodeMiniBody">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>›</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
          <NodeTypeSelect value={node.type} onChange={changeType} compact />
          {miniFile && (
            <span
              className={`nodeAudioStatus ${miniFile.status === 'synced' ? 'nodeAudioStatusSynced' : 'nodeAudioStatusLocal'}`}
              title={miniFile.status === 'synced' ? 'На сервере' : 'Локально'}
            >
              {miniFile.status === 'synced' ? '↑' : '○'}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── max ─────────────────────────────────────────────────────────
  return (
    <div className={`canvasNode canvasNodeMax${selected ? ' canvasNodeSelected' : ''}${dimmed ? ' canvasNodeDimmed' : ''}`} style={{ background: colorBg(color, 0.07) }} onMouseDown={handleDragStart}>
      <div className="canvasNodeTopBar" style={{ background: color }} />
      <NodeMediaBadge node={node} />
      <div className="canvasNodeMaxBody">
        <div className="canvasNodeMaxTop">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>‹</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
        </div>
        <NodeContentEditor
          node={node}
          onUpdate={handleUpdate}
          allNodes={allNodes}
          lessonFiles={lessonFiles}
          onPickLessonFile={onPickLessonFile}
          onTriggerMeasure={handleTriggerMeasure}
          moduleLessons={moduleLessons}
        />
      </div>
    </div>
  )
}

export default memo(CanvasNode)
