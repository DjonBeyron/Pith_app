import { useRef, useEffect, useCallback } from 'react'
import { drawWaveBar, WAVEFORM_FPS } from '../../../shared/lib/audioUtils.js'
import { startDragSession } from '../table-editor/timelineDrag.js'
import { snapPoint, snapMove } from '../table-editor/timelineSnap.js'

// Дорожка озвучки тренажёра — как аудиодорожка в Premiere: куски файла
// (audioClips.js) лежат на композиции, каждый со своей волной. Тело — двигать,
// ручки — подрезать, ✂ в колонке названий — разрезать по плейхеду, × на
// куске — убрать, ⧉ — тот же кусок ещё раз встык (как повтор у слова),
// выпадающий список — какое слово диктора светится, пока звучит этот кусок
// (по умолчанию — по таймингам озвучки, см. litWindows). Тишина между
// кусками — окно, когда говорит ученик.
function AudioClipPiece({ clip, wave, duration, currentTime, wordOptions, onTrim, onMove, onRemove, onDuplicate, onPickLayer }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const from = Math.floor(clip.from * WAVEFORM_FPS)
    const to   = Math.ceil((clip.from + clip.len) * WAVEFORM_FPS)
    const slice = wave?.length ? wave.slice(from, to) : null
    const progress = Math.max(0, Math.min(1, (currentTime - clip.at) / clip.len))
    drawWaveBar(canvasRef.current, slice, progress)
  }, [clip, wave, currentTime])

  const pct = t => (duration ? (t / duration) * 100 : 0)
  return (
    <div className="slAudioClip" style={{ left: `${pct(clip.at)}%`, width: `${pct(clip.len)}%` }}
      title={`Файл ${clip.from.toFixed(2)}–${(clip.from + clip.len).toFixed(2)} с`}>
      <canvas className="slAudioClipCanvas" ref={canvasRef} />
      <select className="tlClipPick slAudioPick" value={clip.layerId ?? ''}
        title="Какое слово загорится, пока звучит этот кусок"
        onMouseDown={e => e.stopPropagation()} onChange={e => onPickLayer(e.target.value)}>
        <option value="">— по озвучке —</option>
        {wordOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button className="tlClipDrop" onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onRemove() }} title="Убрать этот кусок озвучки">×</button>
      <button className="slClipDup slAudioDup" onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDuplicate() }} title="Повторить этот кусок ещё раз встык">⧉</button>
      <div className="tlClipHandleL" onMouseDown={e => onTrim(e, 'left')} />
      <div className="tlClipBody"    onMouseDown={onMove} />
      <div className="tlClipHandleR" onMouseDown={e => onTrim(e, 'right')} />
    </div>
  )
}

export default function AudioClipTrack({
  clips, wave, duration, stripPx, currentTime, snapAt = null, snapEdges = [], layers = [],
  onSplit, onMove, onTrim, onRemove, onDuplicate, onPickLayer, onUndo, canUndo,
}) {
  const stripRef = useRef(null)
  // Слова диктора для списка на куске; одинаковые тексты различаем номером
  const coachLayers = layers.filter(l => (l.role ?? 'coach') === 'coach' && l.visible !== false && (l.text ?? '').trim())
  const wordOptions = coachLayers.map((l, i) => {
    const same = coachLayers.filter(x => x.text === l.text)
    const n = coachLayers.slice(0, i + 1).filter(x => x.text === l.text).length
    return { id: l.id, label: same.length > 1 ? l.text + ' #' + n : l.text }
  })

  const getTime = useCallback(e => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect?.width || !duration) return 0
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  const stripWidth = () => stripRef.current?.getBoundingClientRect().width ?? 0
  // Липнем к плейхеду и к краям клипов слов — кусок озвучки встаёт ровно под
  // вылет слова. Свои края не считаем (у них другой layerId — 'audio')
  const targets = () => (snapAt == null ? [] : [snapAt, ...snapEdges.filter(e => e.layerId !== 'audio').map(e => e.t)])
  const snap = t => snapPoint(t, { targets: targets(), duration, stripWidth: stripWidth() })

  function startTrim(e, clip, side) {
    e.preventDefault(); e.stopPropagation()
    startDragSession(mv => onTrim(clip.id, side, snap(getTime(mv))))
  }

  function startMove(e, clip) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const initAt = clip.at
    startDragSession(mv => {
      const rect = stripRef.current?.getBoundingClientRect()
      if (!rect?.width) return
      const dx = ((mv.clientX - startX) / rect.width) * duration
      const free = Math.max(0, Math.min(duration - clip.len, initAt + dx))
      onMove(clip.id, snapMove(free, clip.len, { targets: targets(), duration, stripWidth: rect.width }))
    })
  }

  return (
    <div className="tlTrack slAudioTrack">
      <button className="tlEye" onClick={onUndo} disabled={!canUndo} title="Отменить последнюю правку нарезки">↶</button>
      {/* Пустая ячейка на месте ⧉ дорожек слов — колонки одной ширины */}
      <span className="tlEye" aria-hidden="true" />
      <div className="tlTrackLabel slAudioLabel">
        Озвучка
        <button className="slSplitBtn" onClick={() => onSplit(currentTime)} title="Разрезать по плейхеду">✂</button>
      </div>
      <div className="tlTrackStrip slAudioStrip" ref={stripRef} style={stripPx ? { minWidth: `${stripPx}px` } : undefined}>
        {clips.map(c => (
          <AudioClipPiece key={c.id} clip={c} wave={wave} duration={duration} currentTime={currentTime} wordOptions={wordOptions}
            onTrim={(e, side) => startTrim(e, c, side)}
            onMove={e => startMove(e, c)}
            onRemove={() => onRemove(c.id)}
            onDuplicate={() => onDuplicate(c.id)}
            onPickLayer={layerId => onPickLayer(c.id, layerId)} />
        ))}
      </div>
      <div className="tlRemovePlaceholder" />
    </div>
  )
}
