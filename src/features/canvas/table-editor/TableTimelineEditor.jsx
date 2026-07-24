import { useState, useRef, useEffect } from 'react'
import { analyzeWaveform, probeAudioDuration, drawWaveBar, fmtAudioTime } from '../../../shared/lib/audioUtils.js'
import { findLastWordLayerId } from '../../../shared/lib/tableDictatorTiming.js'
import { useTableTimelineEdit } from './useTableTimelineEdit.js'
import TableTimelineTrack from './TableTimelineTrack.jsx'
import TableTimelineRuler from './TableTimelineRuler.jsx'

export default function TableTimelineEditor({ table, fileId, waveformData, duration, timeline, answer, lessonFiles, onPickFile, onBack }) {
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
  const cellById    = new Map(cells.map(c => [c.id, c]))
  const sortedCells = [...cells].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
  const [newCellId, setNewCellId] = useState(sortedCells[0]?.id ?? null)

  const audioRef = useRef(null)
  const waveRef  = useRef(null)
  const ownedRef = useRef(null)

  const { layers, initClips, toggleVisible, toggleHighlight, updateClip, addLayer, addWordLayer, addCheckLayer, removeLayer, getTimeline } = useTableTimelineEdit(timeline, cells)
  const lastWordLayerId = findLastWordLayerId(layers)
  // Таймлайн всегда на 10с длиннее аудио — есть куда поставить проверку ПОСЛЕ конца аудио.
  // Нужен и здесь (не только ниже, для вёрстки): дефолтная длина клипа-проявления ячейки.
  const timelineDur = localDuration ? localDuration + 10 : 0

  // Порядок дорожек: сначала все cell-слои по столбцам (весь столбец 1 сверху вниз,
  // потом столбец 2, ...), word/check-слои — после них, в своём обычном порядке.
  const sortedLayers = [...layers].sort((a, b) => {
    const ca = cellById.get(a.cellId), cb = cellById.get(b.cellId)
    if (ca && cb) return ca.col !== cb.col ? ca.col - cb.col : ca.row - cb.row
    if (ca && !cb) return -1
    if (!ca && cb) return 1
    return 0
  })

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
    initClips(localDuration, timelineDur)
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

  // Волна на паузе: перерисовать при любой смене currentTime (клик/протяжка по
  // линейке-плейхеду) — раньше это было в одном эффекте с RAF-циклом ниже и не
  // зависело от currentTime, поэтому клик по линейке не красил волну зелёным,
  // пока не нажат play.
  useEffect(() => {
    if (!localDuration || isPlaying) return
    drawWaveBar(waveRef.current, localWave, currentTime / localDuration)
  }, [currentTime, isPlaying, localWave, localDuration])

  // RAF-цикл волны во время игры — отдельно, чтобы не перезапускаться на каждый currentTime
  useEffect(() => {
    if (!localDuration || !isPlaying) return
    let rafId
    const tick = () => {
      const t = audioRef.current?.currentTime ?? 0
      setCurrentTime(t)
      drawWaveBar(waveRef.current, localWave, localDuration ? t / localDuration : 0)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, localWave, localDuration])

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

  // Клик/протяжка по линейке (как в Premiere) — ставит плейхед; play/пробел продолжат
  // именно отсюда, т.к. это просто currentTime самого <audio>.
  function handleSeek(t) {
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  const stripPx = Math.max(200, Math.round(timelineDur * 80))
  // Канвас волны занимает только аудио-часть таймлайна (первую), дальше — пусто.
  const wavePx  = timelineDur ? Math.round(stripPx * localDuration / timelineDur) : stripPx
  // Отступ слева до начала стрипа = 👁(22) + gap(6) + метка(92) — держим тем же
  // числом, что и в CSS (.tlWaveSpacer/.tlTrackLabel), иначе плейхед разъедется
  // с линейкой/клипами.
  const TRACK_LABEL_OFFSET_PX = 120
  const cursorLeftPx = timelineDur ? TRACK_LABEL_OFFSET_PX + (currentTime / timelineDur) * stripPx : 0

  return (
    <div className="tlEditor">
      {/* Только «Назад» — она же сохраняет (onBack в TableEditorModal сам коммитит
          изменения перед закрытием таймлайна), отдельная «Сохранить» была дублем. */}
      <div className="tlHeader">
        <button className="tlBtnBack" onClick={() => onBack({ file_id: localFileId, waveformData: localWave, duration: localDuration, timeline: getTimeline() })}>← Назад</button>
        <span className="tlTitle">Таймлайн</span>
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

      {/* Слои для слов ответа и «Проверить» появляются сами (см. эффект выше на
          localDuration) — отдельных кнопок для этого больше нет, только подсказка. */}
      <div className="tlHint">
        {localDuration ? 'Тяните ручки клипа — задайте начало/конец. Тяните тело — двигайте. 👁 — скрыть.' : 'Сначала добавьте аудио.'}
      </div>

      <div className="tlTracks">
        {/* Обёртка натуральной высоты (= вся прокручиваемая высота содержимого) —
            плейхед внутри неё растягивается на 100% этой высоты одним куском,
            а не по кускам на дорожку (иначе рвётся в отступах между дорожками). */}
        <div className="tlTracksInner">
          {/* Линейка времени (засечки 0.1с + подписи секунд) — над всеми дорожками.
              Клик/протяжка по ней ставит плейхед — play/пробел играют оттуда. */}
          {timelineDur ? (
            <TableTimelineRuler duration={timelineDur} stripPx={stripPx} onSeek={handleSeek} />
          ) : null}
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
          {sortedLayers.map(layer => (
            <TableTimelineTrack
              key={layer.id}
              layer={layer}
              cells={cells}
              duration={timelineDur}
              stripPx={stripPx}
              isLastWord={layer.id === lastWordLayerId}
              onToggleVisible={() => toggleVisible(layer.id)}
              onToggleHighlight={() => toggleHighlight(layer.id)}
              onUpdateClip={clip => updateClip(layer.id, clip, 0)}
              onUpdateReveal={clip => updateClip(layer.id, clip, 1)}
              onRemove={() => removeLayer(layer.id)}
            />
          ))}
          {/* Единственный сквозной плейхед — цельная линия через линейку и все дорожки */}
          {timelineDur ? <div className="tlCursorLine" style={{ left: `${cursorLeftPx}px` }} /> : null}
        </div>
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
          <button className="tlAddTrackBtn" onClick={() => addLayer(newCellId, localDuration, timelineDur)}>
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
