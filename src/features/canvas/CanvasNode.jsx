import NodeAudioPicker from './NodeAudioPicker.jsx'
import NodeMediaCrop from './NodeMediaCrop.jsx'
import NodeTriggerEditor from './NodeTriggerEditor.jsx'

const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }

const TYPE_COLOR = {
  audio:  '#4a7ca8',
  photo:  '#5a9a5a',
  video:  '#7a5a9a',
  circle: '#c06a6a',
  text:   '#55556a',
}

const NEXT_SIZE = { nano: 'mini', mini: 'max', max: 'nano' }

export default function CanvasNode({
  node, onUpdate, onDragStart, wasDragged, allNodes, lessonFiles = [], onPickLessonFile,
}) {
  const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.text
  // Per-type data: each type stores its own file_id and (for photo/video) crop
  const tData  = node.typeData?.[node.type] ?? {}
  const fileId = tData.file_id ?? null
  const crop   = tData.crop ?? DEFAULT_CROP

  function updateTypeData(patch) {
    onUpdate({
      typeData: {
        ...node.typeData,
        [node.type]: { ...tData, ...patch },
      },
    })
  }

  function expandClick(e) {
    e.stopPropagation()
    if (wasDragged()) return
    onUpdate({ size: NEXT_SIZE[node.size] })
  }

  function changeType(e) {
    e.stopPropagation()
    // Just switch type — typeData for each type is preserved independently
    onUpdate({ type: e.target.value })
  }

  function handleAudioPick(file) {
    const id = onPickLessonFile(file)
    updateTypeData({ file_id: id })
  }

  function handleMediaPick(file) {
    const id = onPickLessonFile(file)
    updateTypeData({ file_id: id, crop: DEFAULT_CROP })
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
            <option value="circle">Кружок</option>
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
          <option value="circle">Кружок</option>
          <option value="text">Текстовое сообщение</option>
        </select>
        {node.type === 'audio' && (
          <NodeAudioPicker
            fileId={fileId}
            lessonFiles={lessonFiles}
            onPick={handleAudioPick}
          />
        )}
        {(node.type === 'photo' || node.type === 'video' || node.type === 'circle') && (
          <NodeMediaCrop
            type={node.type}
            fileId={fileId}
            crop={crop}
            lessonFiles={lessonFiles}
            onPickFile={handleMediaPick}
            onCropChange={newCrop => updateTypeData({ crop: newCrop })}
            shape={node.type === 'circle' ? 'circle' : 'rect'}
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
