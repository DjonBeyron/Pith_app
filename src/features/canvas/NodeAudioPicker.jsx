import { useState } from 'react'
import NodeHighlightEditor from './NodeHighlightEditor.jsx'

function truncate(name, max = 20) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

export default function NodeAudioPicker({
  fileId, lessonFiles, onPick,
  text = '', onTextChange,
  highlights = [], onHighlightsChange,
}) {
  const file = lessonFiles.find(f => f.id === fileId) ?? null
  const [selection,  setSelection]  = useState(null)
  const [showEditor, setShowEditor] = useState(false)

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (f) onPick(f)
    e.target.value = ''
  }

  function handleSelect(e) {
    const ta  = e.currentTarget
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim()
    setSelection(sel || null)
  }

  return (
    <div className="nodeAudioWrap" onClick={e => e.stopPropagation()}>
      <div className="nodeAudioPicker">
        <label className="nodeAudioPickerLabel">
          <input type="file" accept="audio/*" className="nodeAudioInput" onChange={handleFileChange} />
          <span className="nodeAudioPickerBtn">
            {file ? truncate(file.name) : '+ Выбрать аудио'}
          </span>
        </label>
        {file && (
          <span
            className={`nodeAudioStatus ${file.status === 'synced' ? 'nodeAudioStatusSynced' : 'nodeAudioStatusLocal'}`}
            title={file.status === 'synced' ? 'На сервере' : 'Локально, не загружено'}
          >
            {file.status === 'synced' ? '↑' : '○'}
          </span>
        )}
      </div>

      <textarea
        className="nodeAudioText"
        value={text}
        onChange={e => onTextChange?.(e.target.value)}
        placeholder="Текст для печатания в плеере…"
        onClick={e => e.stopPropagation()}
        onMouseUp={handleSelect}
        onKeyUp={handleSelect}
        rows={3}
      />

      {selection && !showEditor && (
        <button
          className="nodeAudioHighlightBtn"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShowEditor(true)}
        >
          Выделить «{selection.length > 18 ? selection.slice(0, 18) + '…' : selection}»
        </button>
      )}

      {showEditor && (
        <NodeHighlightEditor
          text={text}
          highlights={highlights}
          onHighlightsChange={onHighlightsChange}
          initialWord={selection}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  )
}
