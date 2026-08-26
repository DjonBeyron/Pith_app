import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { fmtAudioTime } from '../../../shared/lib/audioUtils.js'
import { extrasStartSec } from '../../../shared/lib/tableDictatorTiming.js'
import { useTableTimelineEdit } from './useTableTimelineEdit.js'
import { useTimelineAudioSource } from './useTimelineAudioSource.js'
import { answerWordsOutsideTable, sortTimelineLayers } from './tableGridUtils.js'
import TableTimelineTrack from './TableTimelineTrack.jsx'
import TableTimelineRuler from './TableTimelineRuler.jsx'
import TableTimelinePreview from './TableTimelinePreview.jsx'
import { startDragSession } from './timelineDrag.js'
import { collectSnapEdges } from './timelineSnapEdges.js'
import { useNoTextSelection } from './useNoTextSelection.js'
import BackButton from '../../../shared/ui/BackButton.jsx'

export default function TableTimelineEditor({ table, fileId, waveformData, duration, timelineLen, timeline, answer, lessonFiles, onPickFile, onBack }) {
  const cells       = table?.cells ?? []
  const cellById    = new Map(cells.map(c => [c.id, c]))
  const sortedCells = [...cells].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
  const [newCellId, setNewCellId] = useState(sortedCells[0]?.id ?? null)
  // Магнит (кнопка 🧲 над колонкой названий): края клипов липнут к плейхеду.
  // Включён по умолчанию — монтаж «в стык» с флажком нужен чаще, чем свободный
  const [snapOn, setSnapOn] = useState(true)

  // Длина композиции задаётся автором и живёт отдельно от аудио: таблицу можно
  // монтировать и вовсе без озвучки. По умолчанию — аудио плюс 10с (есть куда
  // поставить проверку ПОСЛЕ конца записи), без аудио — 15с.
  const [localLen, setLocalLen] = useState(
    () => timelineLen ?? (duration ? Math.round(duration + 10) : 15),
  )
  const timelineDur = Math.max(1, localLen)

  // Аудио-источник (файл/волна/воспроизведение) — useTimelineAudioSource.js
  const {
    localFileId, localWave, localDuration, localBlobUrl, analyzing, isPlaying, currentTime,
    audioRef, waveRef, audioElProps, handleFileChange, removeAudio, togglePlay, handleSeek,
  } = useTimelineAudioSource({ fileId, waveformData, duration, lessonFiles, onPickFile, timelineDur, setLocalLen })

  const { layers, initClips, toggleVisible, toggleHighlight, toggleCollect, setAllCollect, setLayerPick, updateClip, updateExtraClip, duplicateClip, addClearClip, removeExtraClip, addLayer, addWordLayer, addCheckLayer, addClearLayer, removeLayer, pruneLayers, getTimeline } = useTableTimelineEdit(timeline, cells)
  // С этого момента уезжает таблица — раньше её отъезда слова не зажигаются
  const extrasStart = extrasStartSec(layers)

  // Общая галочка «в сборку»: показывает состояние всех слоёв разом (кроме
  // «Проверить» — у него своей галочки нет) и переключает их одним кликом
  const collectable = layers.filter(l => !l.isCheck)
  const allCollect  = collectable.length > 0 && collectable.every(l => l.collect !== false)
  const someCollect = collectable.some(l => l.collect !== false)

  // Порядок дорожек: ячейки → слова → «Проверить» всегда снизу (tableGridUtils)
  const sortedLayers = sortTimelineLayers(layers, cellById)

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

  // Ширина полосы дорожек: секунда композиции = 80px, но не уже 200px
  const stripPx = Math.max(200, Math.round(timelineDur * 80))

  // Куда липнут края клипов кроме плейхеда: границы клипов всех дорожек
  // (свои клип отфильтрует сам, см. TableTimelineTrack)
  const snapEdges = useMemo(() => collectSnapEdges(layers), [layers])

  // Протяжка за сам плейхед — считаем время по той же полосе, что и линейка
  const rootRef = useRef(null)
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
  // Выделение текста на всей странице таймлайна запрещено (кроме полей ввода)
  useNoTextSelection(rootRef)

  function timeAtX(clientX) {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect?.width) return 0
    return Math.max(0, Math.min(timelineDur, ((clientX - rect.left) / rect.width) * timelineDur))
  }

  function startCursorDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    startDragSession(mv => handleSeek(timeAtX(mv.clientX)))
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
    <div className="tlEditor" ref={rootRef}>
      {/* Только «Назад» — она же сохраняет (onBack в TableEditorModal сам коммитит
          изменения перед закрытием таймлайна), отдельная «Сохранить» была дублем. */}
      <div className="tlHeader">
        <BackButton onClick={() => onBack({
          file_id: localFileId, waveformData: localWave, duration: localDuration,
          timelineLen: timelineDur, timeline: getTimeline(),
        })} />
        <span className="tlTitle">Таймлайн</span>
        <button
          className={`tlAllCollect${allCollect ? ' tlAllCollectOn' : someCollect ? ' tlAllCollectSome' : ''}`}
          title={allCollect
            ? 'Все слои идут в сборку фразы — выключить все'
            : 'Включить сборку у всех слоёв'}
          disabled={!collectable.length}
          onClick={() => setAllCollect(!allCollect)}
        >
          <span className="tlAllCollectBox">{allCollect ? '✓' : someCollect ? '–' : ''}</span>
          В сборку
        </button>

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
          <TableTimelineRuler
            duration={timelineDur}
            stripPx={stripPx}
            onSeek={handleSeek}
            onResize={setLocalLen}
            stripRef={stripRef}
            snapOn={snapOn}
            onToggleSnap={() => setSnapOn(v => !v)}
          />
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
              snapAt={snapOn ? currentTime : null}
              snapEdges={snapEdges}
              onToggleVisible={() => toggleVisible(layer.id)}
              onToggleHighlight={() => toggleHighlight(layer.id)}
              onToggleCollect={() => toggleCollect(layer.id)}
              onPick={value => setLayerPick(layer.id, value)}
              onUpdateExtra={(kind, i, clip) => updateExtraClip(layer.id, kind, i, clip)}
              onDuplicate={() => duplicateClip(layer.id, timelineDur)}
              onAddClear={() => addClearClip(layer.id, timelineDur)}
              onRemoveExtra={(kind, i) => removeExtraClip(layer.id, kind, i)}
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
          <button
            className="tlAddTrackBtn"
            title="Отдельная дорожка: в её начале собранная фраза очищается"
            onClick={() => addClearLayer(timelineDur)}
          >
            + Очистить
          </button>
        </div>
      )}

      {localBlobUrl && (
        <audio ref={audioRef} src={localBlobUrl} {...audioElProps} />
      )}
    </div>
  )
}
