import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { analyzeWaveform, probeAudioDuration, drawWaveBar, fmtAudioTime } from '../../../shared/lib/audioUtils.js'
import { extrasStartSec } from '../../../shared/lib/tableDictatorTiming.js'
import { useTableTimelineEdit } from './useTableTimelineEdit.js'
import { answerWordsOutsideTable, sortTimelineLayers } from './tableGridUtils.js'
import TableTimelineTrack from './TableTimelineTrack.jsx'
import TableTimelineRuler from './TableTimelineRuler.jsx'
import TableTimelinePreview from './TableTimelinePreview.jsx'
import { createSilentClock } from '../../../shared/lib/silentClock.js'
import BackButton from '../../../shared/ui/BackButton.jsx'

export default function TableTimelineEditor({ table, fileId, waveformData, duration, timelineLen, timeline, answer, lessonFiles, onPickFile, onBack }) {
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
  // Монтаж без озвучки: время крутят часы (silentClock.js) — интерфейс тот же,
  // что у <audio>, поэтому весь код ниже про currentTime/play/pause не меняется
  const clockRef = useRef(null)
  const silent   = !localBlobUrl

  const { layers, initClips, toggleVisible, toggleHighlight, updateClip, addLayer, addWordLayer, addCheckLayer, removeLayer, pruneLayers, getTimeline } = useTableTimelineEdit(timeline, cells)
  // С этого момента уезжает таблица — раньше её отъезда слова не зажигаются
  const extrasStart = extrasStartSec(layers)
  // Длина композиции задаётся автором и живёт отдельно от аудио: таблицу можно
  // монтировать и вовсе без озвучки. По умолчанию — аудио плюс 10с (есть куда
  // поставить проверку ПОСЛЕ конца записи), без аудио — 15с.
  const [localLen, setLocalLen] = useState(
    () => timelineLen ?? (duration ? Math.round(duration + 10) : 15),
  )
  const timelineDur = Math.max(1, localLen)

  // Порядок дорожек: ячейки → слова → «Проверить» всегда снизу (tableGridUtils)
  const sortedLayers = sortTimelineLayers(layers, cellById)

  useEffect(() => {
    if (localBlobUrl || !fileId) return
    const f = lessonFiles?.find(lf => lf.id === fileId)
    if (!f?.localFile) return
    const url = URL.createObjectURL(f.localFile)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    ownedRef.current = url
    // Один раз на маунт синхронизируем локальный blob-URL с внешним File
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalBlobUrl(url)
  }, []) // eslint-disable-line

  useEffect(() => {
    initClips(localDuration || timelineDur, timelineDur)
    if (!answer?.trim()) return
    // Авто-добавление word-слоёв для слов вне таблицы
    answerWordsOutsideTable(answer, cells).forEach(word => {
      addWordLayer(word, localDuration || timelineDur)  // дедуплицирует сам
    })
    addCheckLayer(localDuration || timelineDur, false)  // добавляет только если нет
  }, [localDuration, timelineDur]) // eslint-disable-line

  // Автор правит «правильный ответ» или текст ячейки — таймлайн подстраивается
  // на лету: для новых слов вне таблицы появляются дорожки, для исчезнувших
  // слов и удалённых ячеек — пропадают
  useEffect(() => {
    if (!cells.length) return
    const outside = answerWordsOutsideTable(answer, cells)
    outside.forEach(word => addWordLayer(word, localDuration || timelineDur))
    pruneLayers(
      new Set(outside.map(w => w.toLowerCase())),
      new Set(cells.map(c => c.id)),
    )
  }, [answer, cells]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const t = (localBlobUrl ? audioRef.current : clockRef.current)?.currentTime ?? 0
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
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localBlobUrl, localDuration, isPlaying])

  useEffect(() => () => {
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    clockRef.current?.stop?.()
  }, [])

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
    // Композиция должна вмещать новую запись — растягиваем, если она короче
    setLocalLen(prev => (dur && prev < dur + 10 ? Math.round(dur + 10) : prev))
    setCurrentTime(0); setAnalyzing(false)
  }

  // Источник времени: аудио, если оно есть, иначе часы
  function timeSource() {
    if (localBlobUrl) return audioRef.current
    if (!localDuration) return null
    if (!clockRef.current || clockRef.current.duration !== timelineDur) {
      clockRef.current?.stop?.()
      clockRef.current = createSilentClock(timelineDur, { onEnded: () => { setIsPlaying(false); setCurrentTime(0) } })
    }
    return clockRef.current
  }

  // Убрать озвучку: аудио уходит и из таймлайна, и из самой ноды (file_id
  // сохранится пустым при выходе). Монтаж при этом никуда не девается —
  // таймлайн продолжает жить по длине композиции
  function removeAudio() {
    if (!window.confirm('Убрать аудио из таблицы? Разметка таймлайна останется.')) return
    audioRef.current?.pause?.()
    if (ownedRef.current) { URL.revokeObjectURL(ownedRef.current); ownedRef.current = null }
    setLocalFileId(null)
    setLocalWave(null)
    setLocalDuration(null)
    setLocalBlobUrl(null)
    setIsPlaying(false)
    setCurrentTime(0)
  }

  function togglePlay() {
    const a = timeSource()
    if (!a) return
    if (isPlaying) { a.pause(); setIsPlaying(false) } else { a.play()?.catch?.(() => {}); if (silent) setIsPlaying(true) }
  }

  // Клик/протяжка по линейке (как в Premiere) — ставит плейхед; play/пробел продолжат
  // именно отсюда, т.к. это просто currentTime самого <audio>.
  function handleSeek(t) {
    const a = timeSource()
    if (a) a.currentTime = t
    setCurrentTime(t)
  }

  // Ширина полосы дорожек: секунда композиции = 80px, но не уже 200px
  const stripPx = Math.max(200, Math.round(timelineDur * 80))

  // Протяжка за сам плейхед — считаем время по той же полосе, что и линейка
  const stripRef = useRef(null)
  const innerRef = useRef(null)
  // Полоса дорожек тянется по свободному месту (flex:1 при min-width), поэтому
  // её реальная ширина бывает больше stripPx. Раньше линия рисовалась по
  // stripPx, а время при протяжке считалось по фактической ширине — из-за
  // расхождения плейхед убегал от курсора и не вставал туда, куда его тянут.
  // Меряем полосу и рисуем линию ровно по ней.
  const [strip, setStrip] = useState({ left: 120, width: 0 })

  useLayoutEffect(() => {
    const s = stripRef.current
    const inner = innerRef.current
    if (!s || !inner) return
    const measure = () => {
      const sb = s.getBoundingClientRect()
      const ib = inner.getBoundingClientRect()
      const next = { left: sb.left - ib.left, width: sb.width }
      setStrip(prev => (prev.left === next.left && prev.width === next.width ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(s)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [stripPx])
  function timeAtX(clientX) {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect?.width) return 0
    return Math.max(0, Math.min(timelineDur, ((clientX - rect.left) / rect.width) * timelineDur))
  }

  function startCursorDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    const move = mv => handleSeek(timeAtX(mv.clientX))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Канвас волны занимает только аудио-часть композиции (первую), дальше пусто.
  // В процентах, а не в пикселях: полоса тянется по свободному месту, и от
  // пиксельной ширины волна разъезжалась бы с линейкой на широком окне
  const wavePct = localDuration ? (localDuration / timelineDur) * 100 : 0
  // Плейхед — по измеренной полосе (см. strip выше): так он всегда совпадает
  // и с засечками линейки, и с клипами дорожек
  const cursorLeftPx = strip.width
    ? strip.left + (currentTime / timelineDur) * strip.width
    : 0

  return (
    <div className="tlEditor">
      {/* Только «Назад» — она же сохраняет (onBack в TableEditorModal сам коммитит
          изменения перед закрытием таймлайна), отдельная «Сохранить» была дублем. */}
      <div className="tlHeader">
        <BackButton onClick={() => onBack({
          file_id: localFileId, waveformData: localWave, duration: localDuration,
          timelineLen: timelineDur, timeline: getTimeline(),
        })} />
        <span className="tlTitle">Таймлайн</span>
        {/* Длина композиции — в углу, как в монтажной программе: работает и с
            озвучкой, и без неё */}
        <label className="tlLenField">
          Длина
          <input
            type="number" min="1" max="600" step="1"
            value={localLen}
            onChange={e => setLocalLen(Math.max(1, Number(e.target.value) || 1))}
          />
          с
        </label>
      </div>

      {/* Управление аудио — только кнопки, без спектра */}
      <div className="tlAudioSection">
        <label className="tlPickBtn">
          {analyzing ? 'Анализ…' : localFileId ? '↺ Заменить аудио' : '+ Добавить аудио'}
          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
        {localFileId && (
          <button className="tlRemoveAudio" title="Убрать аудио из таблицы" onClick={removeAudio}>
            ✕ Убрать аудио
          </button>
        )}
        {localBlobUrl ? (
          <>
            <button className="tlPlayBtn" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
            <span className="tlTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(localDuration)}</span>
          </>
        ) : (
          /* Без озвучки время крутят часы (silentClock.js) — монтаж такой же */
          <>
            <button className="tlPlayBtn" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
            <span className="tlTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(timelineDur)}</span>
            <span className="tlSilentMark">без звука</span>
          </>
        )}
      </div>

      {/* Слои для слов ответа и «Проверить» появляются сами (см. эффект выше на
          localDuration) — отдельных кнопок для этого больше нет, только подсказка. */}
      <div className="tlHint">
        Тяните ручки клипа — задайте начало/конец. Тяните тело — двигайте. 👁 — скрыть.
        Длина композиции — в шапке, аудио для монтажа не обязательно.
      </div>

      {(
        <TableTimelinePreview
          table={table}
          layers={layers}
          currentTime={currentTime}
          duration={timelineDur}
        />
      )}

      <div className="tlTracks">
        {/* Обёртка натуральной высоты (= вся прокручиваемая высота содержимого) —
            плейхед внутри неё растягивается на 100% этой высоты одним куском,
            а не по кускам на дорожку (иначе рвётся в отступах между дорожками). */}
        <div className="tlTracksInner" ref={innerRef}>
          {/* Линейка времени (засечки 0.1с + подписи секунд) — над всеми дорожками.
              Клик/протяжка по ней ставит плейхед — play/пробел играют оттуда. */}
          <TableTimelineRuler duration={timelineDur} stripPx={stripPx} onSeek={handleSeek} stripRef={stripRef} />
          {/* Спектр — только аудио-часть (слева); справа пустой хвост таймлайна */}
          {localBlobUrl && (
            <div className="tlWaveTrack">
              <div className="tlWaveSpacer" />
              <div style={{ flex: 1, minWidth: `${stripPx}px` }}>
                <canvas className="tlWaveTrackCanvas" ref={waveRef} style={{ width: `${wavePct}%` }} />
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
              extrasStart={extrasStart}
              onToggleVisible={() => toggleVisible(layer.id)}
              onToggleHighlight={() => toggleHighlight(layer.id)}
              onUpdateClip={clip => updateClip(layer.id, clip, 0)}
              onUpdateReveal={clip => updateClip(layer.id, clip, 1)}
              onRemove={() => removeLayer(layer.id)}
            />
          ))}
          {/* Единственный сквозной плейхед — цельная линия через линейку и все дорожки */}
          {/* Флажок плейхеда: тащить можно и за него, и за линию — зона
              захвата шире самой линии (см. .tlCursorGrab), иначе попасть
              мышью в 2px непросто */}
          <div
            className="tlCursorLine"
            style={{ left: `${cursorLeftPx}px` }}
            onMouseDown={startCursorDrag}
          >
            <span className="tlCursorGrab" />
            <span className="tlCursorFlag" />
          </div>
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
