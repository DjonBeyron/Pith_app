import NodeAudioPicker from './NodeAudioPicker.jsx'
import NodeTriggerEditor from './NodeTriggerEditor.jsx'

const TYPE_COLOR = {
  audio: '#4a7ca8',
  photo: '#5a9a5a',
  video: '#7a5a9a',
  text:  '#55556a',
}

const NEXT_SIZE = { nano: 'mini', mini: 'max', max: 'nano' }

export default function CanvasNode({
  node, onUpdate, onDragStart, wasDragged, allNodes, lessonFiles = [], onPickLessonFile,
}) {
  const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.text

  function expandClick(e) {
    e.stopPropagation()
    if (wasDragged()) return
    onUpdate({ size: NEXT_SIZE[node.size] })
  }

  function changeType(e) {
    e.stopPropagation()
    onUpdate({ type: e.target.value })
  }

  function handleAudioPick(file) {
    const id = onPickLessonFile(file)
    onUpdate({ file_id: id })
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
  const miniFile = lessonFiles.find(f => f.id === node.file_id) ?? null

  if (node.size === 'mini') {
    return (
      <div className="canvasNode canvasNodeMini" onMouseDown={onDragStart}>
        <div className="canvasNodeTopBar" style={{ background: color }} />
        <div className="canvasNodeMiniBody">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>›</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
          <select
            className="canvasNodeTypeSelectSm"
            value={node.type}
            onClick={e => e.stopPropagation()}
            onChange={changeType}
          >
            <option value="audio">Голосовое</option>
            <option value="photo">Фото</option>
            <option value="video">Видео</option>
            <option value="text">Текстовое</option>
          </select>
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
    <div className="canvasNode canvasNodeMax" onMouseDown={onDragStart}>
      <div className="canvasNodeTopBar" style={{ background: color }} />
      <div className="canvasNodeMaxBody">
        <div className="canvasNodeMaxTop">
          <button className="canvasNodeExpandBtn" onClick={expandClick}>‹</button>
          <span className="canvasNodeSeq">#{node.seq}</span>
        </div>
        <select
          className="canvasNodeTypeSelect"
          value={node.type}
          onClick={e => e.stopPropagation()}
          onChange={changeType}
        >
          <option value="audio">Голосовое сообщение</option>
          <option value="photo">Фото сообщение</option>
          <option value="video">Видео сообщение</option>
          <option value="text">Текстовое сообщение</option>
        </select>
        {node.type === 'audio' && (
          <NodeAudioPicker
            fileId={node.file_id}
            lessonFiles={lessonFiles}
            onPick={handleAudioPick}
          />
        )}
        <NodeTriggerEditor
          triggers={node.triggers}
          nodes={allNodes}
          onChange={triggers => onUpdate({ triggers })}
        />
      </div>
    </div>
  )
}
