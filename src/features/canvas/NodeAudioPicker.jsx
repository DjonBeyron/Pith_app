import { useState, useRef, useEffect } from 'react'
import NodeHighlightEditor from './NodeHighlightEditor.jsx'
import { analyzeWaveform, probeAudioDuration } from '../../shared/lib/audioUtils.js'
import { transcribeAudio } from '../../shared/lib/transcribeApi.js'

function truncate(name, max = 20) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

// status: 'idle' | 'loading' | 'done' | 'error'
function StatusTag({ label, status }) {
  if (status === 'idle') return null
  const cls = status === 'loading' ? 'nodeAudioTagLoading'
    : status === 'error' ? 'nodeAudioTagError' : 'nodeAudioTagDone'
  const icon = status === 'loading' ? '●' : status === 'error' ? '⚠' : '✓'
  return <span className={`nodeAudioTag ${cls}`}>{icon} {label}</span>
}

export default function NodeAudioPicker({
  fileId, lessonFiles, onPick, onAnalyzed,
  hasWaveform = false, hasTimings = false,
  text = '', onTextChange,
  highlights = [], onHighlightsChange,
}) {
  const file = lessonFiles.find(f => f.id === fileId) ?? null
  const [selection,  setSelection]  = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [waveStatus, setWaveStatus] = useState('idle')
  const [txStatus,   setTxStatus]   = useState('idle')

  // Ref keeps latest onAnalyzed so async callbacks never use stale closure
  const onAnalyzedRef = useRef(onAnalyzed)
  useEffect(() => { onAnalyzedRef.current = onAnalyzed })

  async function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    onPick(f)
    e.target.value = ''

    setWaveStatus('loading')
    setTxStatus('loading')

    // Waveform + duration — local, fast (~1-2s)
    const blobUrl = URL.createObjectURL(f)
    Promise.all([analyzeWaveform(blobUrl), probeAudioDuration(blobUrl)])
      .then(([waveformData, duration]) => {
        onAnalyzedRef.current({ waveformData, duration })
        setWaveStatus('done')
      })
      .catch(() => setWaveStatus('error'))
      .finally(() => URL.revokeObjectURL(blobUrl))

    // Transcription — Edge Function, slower (~5-20s)
    transcribeAudio({ file: f })
      .then(wordTimings => {
        onAnalyzedRef.current({ wordTimings })
        setTxStatus('done')
      })
      .catch(() => setTxStatus('error'))
  }

  function handleSelect(e) {
    const ta  = e.currentTarget
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim()
    setSelection(sel || null)
  }

  // Show stored state when status is idle (file loaded from server)
  const waveDisplay = waveStatus !== 'idle' ? waveStatus : hasWaveform ? 'done' : 'idle'
  const txDisplay   = txStatus   !== 'idle' ? txStatus   : hasTimings  ? 'done' : 'idle'

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

      {file && (waveDisplay !== 'idle' || txDisplay !== 'idle') && (
        <div className="nodeAudioTagRow">
          <StatusTag label="wave" status={waveDisplay} />
          <StatusTag label="текст" status={txDisplay} />
        </div>
      )}

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
