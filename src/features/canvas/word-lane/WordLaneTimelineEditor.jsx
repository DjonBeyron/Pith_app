import { useState, useRef, useMemo } from 'react'
import { fmtAudioTime } from '../../../shared/lib/audioUtils.js'
import { useTimelineAudioSource } from '../table-editor/useTimelineAudioSource.js'
import { useTimelineStrip } from '../table-editor/useTimelineStrip.js'
import { useNoTextSelection } from '../table-editor/useNoTextSelection.js'
import TableTimelineRuler from '../table-editor/TableTimelineRuler.jsx'
import WordLaneClipTrack from './WordLaneClipTrack.jsx'
import BackButton from '../../../shared/ui/BackButton.jsx'
import { normalizeFills, defaultFills, fillsFromTimings } from '../../player/modules/rotate-phone/wordLanePlan.js'

// Таймлайн игры «Повтори за диктором» — монтажный стол таблицы-диктора (линейка, магнит, плейхед, спектр озвучки), но дорожек всего три — по числу слоёв на экране.
// Клип слоя = «слой начинает заливаться, когда в озвучке звучит слово, и заливается на длину клипа». 🪄 «По озвучке» ставит клипы по таймингам слов ElevenLabs, дальше можно двигать руками.
// Без озвучки таймлайн не нужен: игра идёт по расписанию по умолчанию, слово звучит из библиотеки озвучки.
export default function WordLaneTimelineEditor({ word, fileId, waveformData, duration, timelineLen, fills, wordTimings, lessonFiles, onPickFile, onBack }) {
  const [snapOn, setSnapOn] = useState(true)
  const [note, setNote] = useState('')
  const [localLen, setLocalLen] = useState(() => timelineLen ?? (duration ? Math.ceil(duration + 1) : 8))
  const timelineDur = Math.max(1, localLen)

  const {
    localFileId, localWave, localDuration, localBlobUrl, analyzing, isPlaying, currentTime,
    audioRef, waveRef, audioElProps, handleFileChange, removeAudio, togglePlay, handleSeek,
  } = useTimelineAudioSource({ fileId, waveformData, duration, lessonFiles, onPickFile, timelineDur, setLocalLen })
  const currentFile = lessonFiles?.find(f => f.id === localFileId) ?? null

  const [clips, setClips] = useState(() => normalizeFills(fills) ?? defaultFills(duration))
  const update = (i, clip) => setClips(prev => prev.map((c, k) => (k === i ? clip : c)))

  function montage() {
    const found = fillsFromTimings(wordTimings, word, localDuration)
    if (found) { setClips(found); setNote('') } else setNote(`В озвучке не нашлось слово «${word || '—'}» три раза — расставьте клипы руками (озвучка из текста «слово. слово. слово.»)`)
  }

  const stripPx = Math.max(200, Math.round(timelineDur * 80))
  const snapEdges = useMemo(() => clips.flatMap((c, i) => [{ t: c.start, layerId: i }, { t: c.end, layerId: i }]), [clips])
  const rootRef = useRef(null)
  const { stripRef, innerRef, cursorLeftPx, startCursorDrag } = useTimelineStrip({ stripPx, duration: timelineDur, currentTime, onSeek: handleSeek })
  useNoTextSelection(rootRef)
  const wavePct = localDuration ? (localDuration / timelineDur) * 100 : 0
  const lit = clips.map(c => currentTime >= c.start && currentTime < c.end)

  return (
    <div className="tlEditor" ref={rootRef}>
      <div className="tlHeader">
        <BackButton onClick={() => onBack({ file_id: localFileId, waveformData: localWave, duration: localDuration, timelineLen: timelineDur, fills: clips })} />
        <span className="tlTitle">Таймлайн игры: «{word || '—'}»</span>
        <label className="tlLenField">
          Длина
          <input type="number" min="1" max="600" step="1" value={localLen} onChange={e => setLocalLen(Math.max(1, Number(e.target.value) || 1))} />
          с
        </label>
      </div>

      <div className="tlAudioSection">
        <label className="tlPickBtn">
          {analyzing ? 'Анализ…' : localFileId ? '↺ Заменить озвучку' : '+ Добавить озвучку'}
          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
        {localFileId && <span className="tlFileName" title={currentFile?.name ?? localFileId}>{currentFile?.name ?? '(загружается…)'}</span>}
        {localFileId && <button className="tlRemoveAudio" onClick={removeAudio}>✕ Убрать озвучку</button>}
        {localFileId && (
          <button className="tlMontageBtn" onClick={montage} title="Расставить слои по таймингам слов ElevenLabs (черновик — дальше можно поправить руками)">🪄 По озвучке</button>
        )}
        <button className="tlPlayBtn" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
        <span className="tlTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(localDuration ?? timelineDur)}</span>
        {!localBlobUrl && <span className="tlSilentMark">без звука</span>}
      </div>

      <div className="tlHint">
        Три клипа — три слоя на дорожках игры. Начало клипа — когда в озвучке звучит слово: в этот момент линия доходит до слоя, слой заливается и (при озвучке) слышно слово.
        Длина клипа — сколько идёт заливка. Линия в игре стартует на 1,2 с раньше звука. Тяните ручки и тело клипа, 🧲 — магнит к плейхеду.
        {note && <b className="slWarn"> {note}</b>}
      </div>

      <div className="wlTlPreview" aria-hidden="true">
        {lit.map((on, i) => <span key={i} className={`wlTlChip${on ? ' wlTlChip--on' : ''}`}>{word || '—'}</span>)}
      </div>

      <div className="tlTracks">
        <div className="tlTracksInner" ref={innerRef}>
          <TableTimelineRuler duration={timelineDur} stripPx={stripPx} onSeek={handleSeek} onResize={setLocalLen} stripRef={stripRef} snapOn={snapOn} onToggleSnap={() => setSnapOn(v => !v)} />
          {localBlobUrl && (
            <div className="tlWaveTrack">
              <div className="tlWaveSpacer" />
              <div style={{ flex: 1, minWidth: `${stripPx}px` }}>
                <canvas className="tlWaveTrackCanvas" ref={waveRef} style={{ width: `${wavePct}%` }} />
              </div>
              <div className="tlWaveSpacerR" />
            </div>
          )}
          {clips.map((clip, i) => (
            <WordLaneClipTrack key={i} index={i} clip={clip} duration={timelineDur} stripPx={stripPx} lit={lit[i]}
              snapAt={snapOn ? currentTime : null} snapEdges={snapEdges} onUpdate={c => update(i, c)} />
          ))}
          <div className="tlCursorLine" style={{ left: `${cursorLeftPx}px` }} onMouseDown={startCursorDrag}>
            <span className="tlCursorGrab" />
            <span className="tlCursorFlag" />
          </div>
        </div>
      </div>

      {localBlobUrl && <audio ref={audioRef} src={localBlobUrl} {...audioElProps} />}
    </div>
  )
}
