import { useState, useRef, useMemo } from 'react'
import { fmtAudioTime } from '../../../shared/lib/audioUtils.js'
import { litWindows, laneCollisions } from '../../../shared/lib/speechLaneTiming.js'
import { audioClipsEnd } from '../../../shared/lib/audioClips.js'
import { useSpeechLaneEdit } from './useSpeechLaneEdit.js'
import { useSpeechLaneFile } from './useSpeechLaneFile.js'
import { useSpeechLaneClock } from './useSpeechLaneClock.js'
import { useAudioClipsEdit } from './useAudioClipsEdit.js'
import { useSpeechLaneMontage } from './useSpeechLaneMontage.js'
import { useTimelineStrip } from '../table-editor/useTimelineStrip.js'
import { collectSnapEdges } from '../table-editor/timelineSnapEdges.js'
import { useNoTextSelection } from '../table-editor/useNoTextSelection.js'
import TableTimelineRuler from '../table-editor/TableTimelineRuler.jsx'
import AudioClipTrack from './AudioClipTrack.jsx'
import SpeechLaneTrack from './SpeechLaneTrack.jsx'
import SpeechLanePreview from './SpeechLanePreview.jsx'
import SpeechLaneAddRow from './SpeechLaneAddRow.jsx'
import BackButton from '../../../shared/ui/BackButton.jsx'

// Редактор таймлайна голосового тренажёра «Переверни телефон» — тот же
// монтажный стол, что у таблицы-диктора (линейка, магнит, плейхед, клипы),
// но без ячеек: дорожки — слова (диктор/ученик), плюс дорожка озвучки,
// которую можно резать как в Premiere (AudioClipTrack). Мастер-время — часы
// композиции, звук идёт следом по нарезке (useSpeechLaneClock).
export default function SpeechLaneTimelineEditor({
  fileId, waveformData, duration, timelineLen, timeline, audioClips: initialAudioClips,
  wordTimings, lessonFiles, onPickFile, onBack,
}) {
  const [snapOn, setSnapOn] = useState(true)
  // Зум: пикселей на секунду композиции. Дорожки прокручиваются по горизонтали
  const [pxPerSec, setPxPerSec] = useState(80)
  const zoom = dir => setPxPerSec(v => Math.round(Math.max(30, Math.min(600, v * (dir > 0 ? 1.3 : 1 / 1.3)))))
  // Длина композиции — своя: озвучка с паузами ученика длиннее самого файла
  const [localLen, setLocalLen] = useState(() => timelineLen ?? (duration ? Math.round(duration * 2 + 5) : 20))
  const timelineDur = Math.max(1, localLen)

  const file = useSpeechLaneFile({ fileId, waveformData, duration, lessonFiles, onPickFile })
  const { localFileId, localWave, localDuration, localBlobUrl, analyzing, currentFile, handleFileChange, removeAudio } = file

  const cut = useAudioClipsEdit(initialAudioClips, localFileId, localDuration)
  const { isPlaying, currentTime, audioRef, togglePlay, handleSeek } = useSpeechLaneClock({ timelineLen: timelineDur, audioClips: cut.clips })

  const edit = useSpeechLaneEdit(timeline)
  const { layers } = edit

  const montage = useSpeechLaneMontage({
    layers, audioClips: cut.clips, localFileId, lessonFiles, timelineLen: timelineDur,
    initialWordTimings: wordTimings, replaceLayers: edit.replaceLayers,
  })

  // Что увидит ученик: где горит слово, где два слова столкнулись в дорожке
  const lit = useMemo(() => litWindows(layers, montage.wordTimings, cut.clips), [layers, montage.wordTimings, cut.clips])
  const collisions = useMemo(() => laneCollisions(layers), [layers])

  const stripPx = Math.max(200, Math.round(timelineDur * pxPerSec))
  // Магнит: края клипов слов + края кусков озвучки (помечены 'audio')
  const snapEdges = useMemo(() => [
    ...collectSnapEdges(layers),
    ...cut.clips.flatMap(c => [{ t: c.at, layerId: 'audio' }, { t: c.at + c.len, layerId: 'audio' }]),
  ], [layers, cut.clips])

  const rootRef = useRef(null)
  const { stripRef, innerRef, cursorLeftPx, startCursorDrag } = useTimelineStrip({
    stripPx, duration: timelineDur, currentTime, onSeek: handleSeek,
  })
  useNoTextSelection(rootRef)

  // Нарезка вылезла за композицию (укоротили длину) — предупредим, не режем
  const audioOverflow = audioClipsEnd(cut.clips) > timelineDur + 0.01

  function save() {
    onBack({
      file_id: localFileId, waveformData: localWave, duration: localDuration,
      timelineLen: timelineDur, timeline: edit.getTimeline(), audioClips: cut.clips,
      wordTimings: montage.wordTimings,
    })
  }

  return (
    <div className="tlEditor slEditor" ref={rootRef}>
      <div className="tlHeader">
        <BackButton onClick={save} />
        <span className="tlTitle">Тренажёр произношения</span>
        <span className="slZoom" title="Масштаб таймлайна">
          <button className="slZoomBtn" onClick={() => zoom(-1)} disabled={pxPerSec <= 30}>−</button>
          <span className="slZoomVal">{Math.round(pxPerSec / 80 * 100)}%</span>
          <button className="slZoomBtn" onClick={() => zoom(1)} disabled={pxPerSec >= 600}>+</button>
        </span>
        <label className="tlLenField">
          Длина
          <input type="number" min="1" max="600" step="1" value={localLen}
            onChange={e => setLocalLen(Math.max(1, Number(e.target.value) || 1))} />
          с
        </label>
      </div>

      <div className="tlAudioSection">
        <label className="tlPickBtn">
          {analyzing ? 'Анализ…' : localFileId ? '↺ Заменить озвучку' : '+ Добавить озвучку'}
          <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
        </label>
        {localFileId && (
          <span className="tlFileName" title={currentFile?.name ?? localFileId}>
            {currentFile?.name ?? '(загружается…)'}
            {currentFile && (
              <span className={currentFile.status === 'local' ? 'tlFileNameLocal' : 'tlFileNameSynced'}>
                {currentFile.status === 'local' ? '○' : '↑'}
              </span>
            )}
          </span>
        )}
        {localFileId && <button className="tlRemoveAudio" onClick={removeAudio}>✕ Убрать</button>}
        {localFileId && (
          <button className="tlMontageBtn" disabled={montage.montaging} onClick={montage.runMontage}
            title="Расставить вылеты слов диктора по озвучке (черновик — дальше руками)">
            {montage.montaging ? '…' : '🪄'} Смонтировать
          </button>
        )}
        <button className="tlPlayBtn" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
        <span className="tlTime">{fmtAudioTime(currentTime)} / {fmtAudioTime(timelineDur)}</span>
        {!localBlobUrl && <span className="tlSilentMark">без звука</span>}
        {audioOverflow && <span className="slWarn" title="Куски озвучки за концом композиции не прозвучат">⚠ озвучка длиннее композиции</span>}
      </div>

      <div className="tlHint">
        Клип слова — его полёт сверху вниз, середина — проход через круг. 🟢/🔴 — кто говорит, 💬 — перевод
        поверх круга на длину клипа, 1/2/3 — дорожка экрана, ⧉ на клипе (и на куске озвучки) — повтор встык, ⧉ слева — копия дорожки.
        Озвучку режьте ✂ по плейхеду, тишина между кусками — время ученика; список на куске — какое слово на нём загорится.
      </div>

      <SpeechLanePreview layers={layers} audioClips={cut.clips} wave={localWave}
        currentTime={currentTime} duration={timelineDur} lit={lit} />

      <div className="tlTracks">
        <div className="tlTracksInner" ref={innerRef}>
          <TableTimelineRuler duration={timelineDur} stripPx={stripPx} onSeek={handleSeek} onResize={setLocalLen}
            stripRef={stripRef} snapOn={snapOn} onToggleSnap={() => setSnapOn(v => !v)} />
          {localFileId && (
            <AudioClipTrack clips={cut.clips} wave={localWave} duration={timelineDur} stripPx={stripPx} layers={layers}
              currentTime={currentTime} snapAt={snapOn ? currentTime : null} snapEdges={snapEdges}
              onSplit={cut.split} onMove={(id, at) => cut.move(id, at, timelineDur)} onTrim={cut.trim}
              onRemove={cut.remove} onDuplicate={id => cut.duplicate(id, timelineDur)} onPickLayer={cut.setLayer}
              onUndo={cut.undo} canUndo={cut.canUndo} />
          )}
          {layers.map(layer => (
            <SpeechLaneTrack key={layer.id} layer={layer} duration={timelineDur} stripPx={stripPx}
              lit={lit} collisions={collisions} snapAt={snapOn ? currentTime : null} snapEdges={snapEdges}
              onToggleVisible={() => edit.toggleVisible(layer.id)}
              onToggleRole={() => edit.toggleRole(layer.id)}
              onCycleLane={() => edit.cycleLane(layer.id)}
              onEdit={fields => edit.updateLayer(layer.id, fields)}
              onUpdateClip={clip => edit.updateClip(layer.id, clip)}
              onUpdateRepeat={(i, clip) => edit.updateRepeat(layer.id, i, clip)}
              onDuplicate={() => edit.duplicateClip(layer.id, timelineDur)}
              onRemoveRepeat={i => edit.removeRepeat(layer.id, i)}
              onRemove={() => edit.removeLayer(layer.id)}
              onDuplicateLayer={() => edit.duplicateLayer(layer.id, timelineDur)} />
          ))}
          <div className="tlCursorLine" style={{ left: `${cursorLeftPx}px` }} onMouseDown={startCursorDrag}>
            <span className="tlCursorGrab" />
            <span className="tlCursorFlag" />
          </div>
        </div>
      </div>

      <SpeechLaneAddRow onAdd={fields => edit.addLayer(fields, currentTime, timelineDur)} />

      {localBlobUrl && <audio ref={audioRef} src={localBlobUrl} preload="auto" />}
    </div>
  )
}
