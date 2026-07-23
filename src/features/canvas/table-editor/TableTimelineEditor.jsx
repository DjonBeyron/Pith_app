import { useState, useRef, useEffect } from 'react'
import { analyzeWaveform, probeAudioDuration, drawWaveBar, fmtAudioTime } from '../../../shared/lib/audioUtils.js'
import { useTableTimelineEdit } from './useTableTimelineEdit.js'
import TableTimelineTrack from './TableTimelineTrack.jsx'
import TableTimelineRuler from './TableTimelineRuler.jsx'

export default function TableTimelineEditor({ table, fileId, waveformData, duration, timeline, answer, lessonFiles, onPickFile, onSave, onBack }) {
  const [localFileId,   setLocalFileId]   = useState(fileId)
  const [localWave,     setLocalWave]     = useState(waveformData)
  const [localDuration, setLocalDuration] = useState(duration)
  const [localBlobUrl,  setLocalBlobUrl]  = useState(() => {
    const f = lessonFiles?.find(lf => lf.id === fileId)
    return f?.r2Url ?? null
  })
  const [analyzing, setAnalyzing]     = useState(false)
  const [isPlaying, setIsPlaying]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  const cells       = table?.cells ?? []
  const sortedCells = [...cells].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
  const [newCellId, setNewCellId] = useState(sortedCells[0]?.id ?? null)

  const audioRef = useRef(null)
  const waveRef  = useRef(null)
  const ownedRef = useRef(null)

  const { layers, initClips, toggleVisible, updateClip, addLayer, addWordLayer, addCheckLayer, removeLayer, getTimeline } = useTableTimelineEdit(timeline, cells)

  function syncWordLayers() {
    const words = (answer ?? '').trim().split(/\s+/).filter(Boolean)
    const usedIds = new Set()
    words.forEach(word => {
      const cell = cells.find(c => c.value?.trim().toLowerCase() === word.toLowerCase() && !usedIds.has(c.id))
      if (cell) { usedIds.add(cell.id); return }
      const exists = layers.some(l => l.word?.toLowerCase() === word.toLowerCase())
      if (!exists) addWordLayer(word, localDuration)
    })
  }

  useEffect(() => {
    if (localBlobUrl || !fileId) return
    const f = lessonFiles?.find(lf => lf.id === fileId)
    if (!f?.localFile) return
    const url = URL.createObjectURL(f.localFile)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    ownedRef.current = url
    setLocalBlobUrl(url)
  }, []) // eslint-disable-line

  useEffect(() => {
    initClips(localDuration)
    if (!localDuration || !answer?.trim()) return
    // Авто-добавление word-слоёв для слов вне таблицы
    const words = answer.trim().split(/\s+/).filter(Boolean)
    const usedIds = new Set()
    words.forEach(word => {
      const cell = cells.find(c => c.value?.trim().toLowerCase() === word.toLowerCase() && !usedIds.has(c.id))
      if (cell) { usedIds.add(cell.id); return }
      addWordLayer(word, localDuration)  // дедуплицирует сам
    })
    addCheckLayer(localDuration, false)  // добавляет только если нет
  }, [localDuration]) // eslint-disable-line

  // RAF-цикл для волны
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

  // Пробел = play/pause (пока этот редактор открыт)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      const a = audioRef.current
      if (!a || !localBlobUrl) return
      if (a.paused) { a.play().catch(() => {}) } else { a.pause() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [localBlobUrl])

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

  // Таймлайн всегда на 10с длиннее аудио — есть куда поставить проверку ПОСЛЕ конца аудио.
  const timelineDur = localDuration ? localDuration + 10 : 0
  const stripPx = Math.max(200, Math.round(timelineDur * 80))
  // Канвас волны занимает только аудио-часть таймлайна (первую), дальше — пусто.
  const wavePx  = timelineDur ? Math.round(stripPx * localDuration / timelineDur) : stripPx

  return (
    <div className="tlEditor">
      <div className="tlHeader">
        <button className="tlBtnBack" onClick={() => onBack({ file_id: localFileId, waveformData: localWave, duration: localDuration, timeline: getTimeline() })}>← Назад</button>
        <span className="tlTitle">Таймлайн</span>
        <button className="tlBtnSave" onClick={() => onSave({ file_id: localFileId, waveformData: localWave, duration: localDuration, timeline: getTimeline() })}>
          Сохранить
        </button>
      </div>

      {/* Управление аудио — только кнопки, без спектра */}
      <div className="tlAudioSection">
        <label className="tlPickBtn">
          {analyzing ? 'Анализ…' : localFileId ? '↺ Заменить аудио' : '+ Добавить аудио'}
          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
        {localBlobUrl && (
          <>
            <button className="tlPlayBtn" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
            <span className="tlTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(localDuration)}</span>
          </>
        )}
      </div>

      <div className="tlHint">
        {localDuration ? 'Тяните ручки клипа — задайте начало/конец. Тяните тело — двигайте. 👁 — скрыть.' : 'Сначала добавьте аудио.'}
        {answer?.trim() && (
          <button className="tlSyncBtn" onClick={syncWordLayers} title="Добавить дорожки для слов из ответа, которых нет в таблице">
            ⟳ Слова из ответа
          </button>
        )}
        <button
          className="tlCheckLayerBtn"
          onClick={() => addCheckLayer(localDuration)}
          title="Добавить/переставить дорожку 'Проверить' — плеер запустит проверку в момент начала клипа"
        >✓ Проверить</button>
      </div>

      <div className="tlTracks">
        {/* Линейка времени (засечки 0.1с + подписи секунд) — над всеми дорожками */}
        {timelineDur ? <TableTimelineRuler duration={timelineDur} stripPx={stripPx} /> : null}
        {/* Спектр — только аудио-часть (слева); справа пустой хвост таймлайна */}
        {localBlobUrl && (
          <div className="tlWaveTrack">
            <div className="tlWaveSpacer" />
            <div style={{ flex: 1, minWidth: `${stripPx}px` }}>
              <canvas className="tlWaveTrackCanvas" ref={waveRef} style={{ width: `${wavePx}px` }} />
            </div>
            <div className="tlWaveSpacerR" />
          </div>
        )}
        {layers.map(layer => (
          <TableTimelineTrack
            key={layer.id}
            layer={layer}
            cells={cells}
            duration={timelineDur}
            currentTime={currentTime}
            stripPx={stripPx}
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

      {localBlobUrl && (
        <audio ref={audioRef} src={localBlobUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
        />
      )}
    </div>
  )
}
