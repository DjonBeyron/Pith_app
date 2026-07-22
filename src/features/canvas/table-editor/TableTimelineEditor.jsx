import { useState, useRef, useEffect } from 'react'
import { analyzeWaveform, probeAudioDuration, drawWaveBar, fmtAudioTime } from '../../../shared/lib/audioUtils.js'
import { useTableTimelineEdit } from './useTableTimelineEdit.js'
import TableTimelineTrack from './TableTimelineTrack.jsx'

export default function TableTimelineEditor({ table, fileId, waveformData, duration, timeline, lessonFiles, onPickFile, onSave, onBack }) {
  const [localFileId,   setLocalFileId]   = useState(fileId)
  const [localWave,     setLocalWave]     = useState(waveformData)
  const [localDuration, setLocalDuration] = useState(duration)
  const [localBlobUrl,  setLocalBlobUrl]  = useState(() => {
    const f = lessonFiles?.find(lf => lf.id === fileId)
    return f?.r2Url ?? null  // синхронизированный файл → R2-URL напрямую
  })
  const [analyzing, setAnalyzing]   = useState(false)
  const [isPlaying, setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  const cells       = table?.cells ?? []
  const sortedCells = [...cells].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
  const [newCellId, setNewCellId] = useState(sortedCells[0]?.id ?? null)

  const audioRef  = useRef(null)
  const waveRef   = useRef(null)
  const ownedRef  = useRef(null)

  const { layers, initClips, toggleVisible, updateClip, addLayer, removeLayer, getTimeline } = useTableTimelineEdit(timeline, cells)

  // Если файл ещё не синхронизирован (r2Url = null), создаём ObjectURL из localFile
  useEffect(() => {
    if (localBlobUrl || !fileId) return
    const f = lessonFiles?.find(lf => lf.id === fileId)
    if (!f?.localFile) return
    const url = URL.createObjectURL(f.localFile)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    ownedRef.current = url
    setLocalBlobUrl(url)
  }, []) // eslint-disable-line

  // Заполняем пустые клипы, когда длительность стала известна
  useEffect(() => { initClips(localDuration) }, [localDuration]) // eslint-disable-line

  // RAF-цикл для волны (вместо onTimeUpdate — без лагов)
  useEffect(() => {
    if (!localDuration) return
    if (!isPlaying) {
      drawWaveBar(waveRef.current, localWave, currentTime / localDuration)
      return
    }
    let rafId
    const tick = () => {
      const t = audioRef.current?.currentTime ?? 0
      setCurrentTime(t)
      drawWaveBar(waveRef.current, localWave, localDuration ? t / localDuration : 0)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, localWave, localDuration]) // eslint-disable-line

  useEffect(() => () => { if (ownedRef.current) URL.revokeObjectURL(ownedRef.current) }, [])

  async function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setAnalyzing(true)
    const id  = onPickFile(f)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    const url = URL.createObjectURL(f)
    ownedRef.current = url
    const [wave, dur] = await Promise.all([analyzeWaveform(url), probeAudioDuration(url)])
    setLocalFileId(id); setLocalWave(wave); setLocalDuration(dur); setLocalBlobUrl(url)
    setCurrentTime(0); setAnalyzing(false)
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (isPlaying) { a.pause() } else { a.play().catch(() => {}) }
  }

  return (
    <div className="tlEditor">
      <div className="tlHeader">
        <button className="tlBtnBack" onClick={onBack}>← Назад</button>
        <span className="tlTitle">Таймлайн</span>
        <button className="tlBtnSave" onClick={() => onSave({ file_id: localFileId, waveformData: localWave, duration: localDuration, timeline: getTimeline() })}>
          Сохранить
        </button>
      </div>

      <div className="tlAudioSection">
        <label className="tlPickBtn">
          {analyzing ? 'Анализ…' : localFileId ? '↺ Заменить аудио' : '+ Добавить аудио'}
          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
        {localBlobUrl && (
          <div className="tlWaveRow">
            <button className="tlPlayBtn" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
            <canvas className="tlWaveCanvas" ref={waveRef} />
            <span className="tlTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(localDuration)}</span>
            <audio ref={audioRef} src={localBlobUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
            />
          </div>
        )}
      </div>

      <div className="tlHint">
        {localDuration ? 'Тяните ручки клипа — задайте начало/конец. Тяните тело — двигайте. 👁 — скрыть.' : 'Сначала добавьте аудио.'}
      </div>

      <div className="tlTracks">
        {layers.map(layer => (
          <TableTimelineTrack
            key={layer.id}
            layer={layer}
            cells={cells}
            duration={localDuration}
            currentTime={currentTime}
            onToggleVisible={() => toggleVisible(layer.id)}
            onUpdateClip={clip => updateClip(layer.id, clip)}
            onRemove={() => removeLayer(layer.id)}
          />
        ))}
      </div>

      {sortedCells.length > 0 && (
        <div className="tlAddTrack">
          <select className="tlCellSelect" value={newCellId ?? ''} onChange={e => setNewCellId(e.target.value)}>
            {sortedCells.map(c => (
              <option key={c.id} value={c.id}>
                {c.value?.trim() || `${c.row + 1}×${c.col + 1}`}
              </option>
            ))}
          </select>
          <button className="tlAddTrackBtn" onClick={() => addLayer(newCellId, localDuration)}>
            + Дорожка
          </button>
        </div>
      )}
    </div>
  )
}
