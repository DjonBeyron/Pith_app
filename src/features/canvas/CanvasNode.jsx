// Color accent by message type — soft tones that read on a dark background.
const TYPE_COLOR = {
  audio: '#4a7ca8',
  photo: '#5a9a5a',
  video: '#7a5a9a',
  text:  '#55556a',
}

const TYPE_LABEL = {
  audio: 'Голосовое',
  photo: 'Фото',
  video: 'Видео',
  text:  'Текстовое',
}

// Click cycles: nano → mini → max → nano
const NEXT_SIZE = { nano: 'mini', mini: 'max', max: 'nano' }

export default function CanvasNode({ node, onUpdate, onDragStart, wasDragged }) {
  const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.text

  function cycleSize(e) {
    e.stopPropagation()
    if (wasDragged()) return
    onUpdate({ size: NEXT_SIZE[node.size] })
  }

  // ── nano ────────────────────────────────────────────────────────
  if (node.size === 'nano') {
    return (
      <div
        className="canvasNode canvasNodeNano"
        style={{ background: color }}
        onMouseDown={onDragStart}
        onClick={cycleSize}
      >
        <span className="canvasNodeSeq">{node.seq}</span>
      </div>
    )
  }

  // ── mini ────────────────────────────────────────────────────────
  if (node.size === 'mini') {
    return (
      <div className="canvasNode canvasNodeMini" onMouseDown={onDragStart} onClick={cycleSize}>
        <div className="canvasNodeMiniBar" style={{ background: color }} />
        <div className="canvasNodeMiniBody">
          <span className="canvasNodeSeq">#{node.seq}</span>
          <span className="canvasNodeTypeLabel">{TYPE_LABEL[node.type]}</span>
        </div>
      </div>
    )
  }

  // ── max ─────────────────────────────────────────────────────────
  return (
    <div className="canvasNode canvasNodeMax" onMouseDown={onDragStart}>
      <div className="canvasNodeMaxTop">
        <span className="canvasNodeSeq">#{node.seq}</span>
        <button className="canvasNodeSizeBtn" onClick={cycleSize} title="Свернуть">↙</button>
      </div>

      <select
        className="canvasNodeTypeSelect"
        value={node.type}
        onClick={e => e.stopPropagation()}
        onChange={e => { e.stopPropagation(); onUpdate({ type: e.target.value }) }}
      >
        <option value="audio">Голосовое сообщение</option>
        <option value="photo">Фото сообщение</option>
        <option value="video">Видео сообщение</option>
        <option value="text">Текстовое сообщение</option>
      </select>

      <div className="canvasNodeTriggerStub">
        Если / Тогда — Этап 3
      </div>
    </div>
  )
}
