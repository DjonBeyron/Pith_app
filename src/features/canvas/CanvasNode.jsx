import { useEffect } from 'react'
import NodeContentEditor from './NodeContentEditor.jsx'
import { applyTypeChange } from './nodeDefaults.js'
import NodeTypeSelect from './NodeTypeSelect.jsx'
import { TYPE_COLOR } from './nodeTypes.js'

const NEXT_SIZE = { nano: 'mini', mini: 'max', max: 'nano' }

// Mix module color with the node dark base (#12141a) instead of rgba transparency,
// so the node stays dark regardless of what's behind it.
function colorBg(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const br = 18, bg = 20, bb = 26  // #12141a
  return `rgb(${Math.round(br + (r - br) * alpha)},${Math.round(bg + (g - bg) * alpha)},${Math.round(bb + (b - bb) * alpha)})`
}

export default function CanvasNode({
  node, onUpdate, onDragStart, wasDragged, allNodes, lessonFiles = [], onPickLessonFile, onTriggerMeasure,
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
        className="canvasNode canvasNodeNano"
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
      <div className="canvasNode canvasNodeMini" style={{ background: colorBg(color, 0.07) }} onMouseDown={onDragStart}>
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
    <div className="canvasNode canvasNodeMax" style={{ background: colorBg(color, 0.07) }} onMouseDown={onDragStart}>
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
