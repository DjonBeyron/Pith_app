import { useEffect } from 'react'
import NodeContentEditor from './NodeContentEditor.jsx'
import { applyTypeChange } from './nodeDefaults.js'
import NodeTypeSelect from './NodeTypeSelect.jsx'
import { TYPE_COLOR, colorBg } from './nodeTypes.js'

const NEXT_SIZE = { nano: 'mini', mini: 'max', max: 'nano' }

export default function CanvasNode({
  node, onUpdate, onDragStart, selected = false, wasDragged, allNodes, lessonFiles = [], onPickLessonFile, onTriggerMeasure,
  moduleLessons = [],
}) {
  const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.text

  // When leaving max mode, clear stale trigger measurements so they don't
  // ghost onto the next max layout (e.g. after type switch or size cycle).
  // word_choice and phrase_assembly handle their own measurements via their pickers.
  useEffect(() => {
    if (node.size !== 'max') onTriggerMeasure?.([])
  }, [node.size, onTriggerMeasure])

  const fileId = node.typeData?.[node.type]?.file_id ?? null

  function expandClick(e) {
    e.stopPropagation()
    if (wasDragged()) return
    onUpdate({ size: NEXT_SIZE[node.size] })
  }

  // Смена типа пересобирает триггеры под дефолт нового типа (nodeDefaults.js) —
  // старые строки не тянутся за нодой и не дублируются. Тип запоминается для новых нод.
  function changeType(newType) {
    onUpdate(applyTypeChange(node, newType))
  }

  // ── nano ────────────────────────────────────────────────────────
  if (node.size === 'nano') {
    return (
      <div
        className={`canvasNode canvasNodeNano${selected ? ' canvasNodeSelected' : ''}`}
        style={{ background: color }}
        onMouseDown={onDragStart}
        onClick={expandClick}
      >
        <span className="canvasNodeSeq">{node.seq}</span>
      </div>
    )
  }

  // ── mini ────────────────────────────────────────────────────────
  const miniFile = lessonFiles.find(f => f.id === fileId) ?? null

  if (node.size === 'mini') {
    return (
      <div className={`canvasNode canvasNodeMini${selected ? ' canvasNodeSelected' : ''}`} style={{ background: colorBg(color, 0.07) }} onMouseDown={onDragStart}>
        <div className="canvasNodeTopBar" style={{ background: color }} />
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
    <div className={`canvasNode canvasNodeMax${selected ? ' canvasNodeSelected' : ''}`} style={{ background: colorBg(color, 0.07) }} onMouseDown={onDragStart}>
      <div className="canvasNodeTopBar" style={{ background: color }} />
      <div className="canvasNodeMaxBody">
        <div className="canvasNodeMaxTop">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>‹</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
        </div>
        <NodeContentEditor
          node={node}
          onUpdate={onUpdate}
          allNodes={allNodes}
          lessonFiles={lessonFiles}
          onPickLessonFile={onPickLessonFile}
          onTriggerMeasure={onTriggerMeasure}
          moduleLessons={moduleLessons}
        />
      </div>
    </div>
  )
}
