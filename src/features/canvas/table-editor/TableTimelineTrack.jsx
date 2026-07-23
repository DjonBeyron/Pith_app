import { useRef, useCallback } from 'react'
import { EXTRA_LEAD_IN_S, EXTRA_LEAD_IN_LAST_S } from '../../../shared/lib/tableDictatorTiming.js'

// Одна дорожка таймлайна. У cell-слоя — два независимых клипа в одной строке:
// подсветка (как раньше) и проявление (серый, когда текст ячейки виден/скрыт).
// У word/check-слоя — как раньше, один клип. isDefault-слои без кнопки удаления.
export default function TableTimelineTrack({ layer, cells, duration, currentTime, stripPx, isLastWord, onToggleVisible, onToggleHighlight, onUpdateClip, onUpdateReveal, onRemove }) {
  const cell  = cells.find(c => c.id === layer.cellId)
  const isCellOnly  = !!layer.cellId && !layer.word && !layer.isCheck
  const clip        = layer.clips[0] ?? null
  const revealClip  = isCellOnly ? (layer.clips[1] ?? null) : null
  const highlightOn = layer.highlightOn !== false
  const stripRef = useRef(null)

  const getTime = useCallback((e) => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !duration) return 0
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  function onHandleDown(e, side, targetClip, onUpdate) {
    e.stopPropagation()
    if (!targetClip || !duration) return
    const init = { ...targetClip }
    const onMove = mv => {
      const t = getTime(mv)
      if (side === 'left') {
        onUpdate({ start: Math.max(0, Math.min(t, init.end - 0.05)), end: init.end })
      } else {
        onUpdate({ start: init.start, end: Math.min(duration, Math.max(t, init.start + 0.05)) })
      }
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onBodyDown(e, targetClip, onUpdate) {
    e.stopPropagation()
    if (!targetClip || !duration) return
    const startX = e.clientX
    const init = { ...targetClip }
    const clipDur = init.end - init.start
    const onMove = mv => {
      const rect = stripRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = ((mv.clientX - startX) / rect.width) * duration
      const s = Math.max(0, Math.min(duration - clipDur, init.start + dx))
      onUpdate({ start: s, end: s + clipDur })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const timeToPct = useCallback(t => (duration ? t / duration * 100 : 0), [duration])
  const isOrphan = !layer.word && !cell && !layer.isCheck

  // Для word-слоя: начало клипа = старт анимации (слайд+список), реальный «выбор»
  // (зелёный) — только после лид-ина. Показываем этот кусок другим цветом — длина
  // куска фиксирована, растягивание/сужение клипа её не меняет, только сдвигает во
  // времени (клип короче лид-ина — кусок просто займёт клип целиком).
  // У последнего по времени word-слоя лид-ин длиннее (EXTRA_LEAD_IN_LAST_S) — он
  // дополнительно ждёт конец отъезда таблицы влево (TABLE_SLIDE_S), см. tableDictatorTiming.js.
  let leadInPct = null
  if (layer.word && clip) {
    const clipDur = clip.end - clip.start
    if (clipDur > 0) {
      const leadIn = isLastWord ? EXTRA_LEAD_IN_LAST_S : EXTRA_LEAD_IN_S
      const leadInEnd = Math.min(clip.end, clip.start + leadIn)
      leadInPct = Math.min(100, (leadInEnd - clip.start) / clipDur * 100)
    }
  }
  const label = layer.isCheck
    ? '✓ Проверить'
    : layer.word
      ? `"${layer.word}"`
      : cell?.value?.trim() || (cell ? `${cell.row + 1}×${cell.col + 1}` : '⚠ удали')
  const cursorPct = timeToPct(currentTime ?? 0)

  return (
    <div className={`tlTrack${!layer.visible ? ' tlTrackHidden' : ''}${layer.word ? ' tlTrackWord' : ''}${layer.isCheck ? ' tlTrackCheck' : ''}${isCellOnly ? ' tlTrackCell' : ''}${isOrphan ? ' tlTrackOrphan' : ''}`}>
      <button className="tlEye" onClick={onToggleVisible} title={layer.visible ? 'Скрыть' : 'Показать'}>
        {layer.visible ? '👁' : '○'}
      </button>
      <div className="tlTrackLabel" title={cell?.value}>{label}</div>
      <div className={`tlTrackStrip${isCellOnly ? ' tlTrackStripDual' : ''}`} ref={stripRef} style={stripPx ? { minWidth: `${stripPx}px` } : undefined}>
        {clip && (
          <div
            className={`tlClip${isCellOnly ? ' tlClipHighlight' : ''}${isCellOnly && !highlightOn ? ' tlClipHighlightOff' : ''}`}
            style={{ left: `${timeToPct(clip.start)}%`, width: `${timeToPct(clip.end) - timeToPct(clip.start)}%` }}
            title={isCellOnly ? 'Подсветка зелёным + выбор ячейки в ответ' : undefined}
          >
            {leadInPct != null && (
              <div
                className="tlClipLeadIn"
                style={{ width: `${leadInPct}%` }}
                title={isLastWord ? 'Анимация + пауза + отъезд таблицы перед выбором последнего слова' : 'Анимация + пауза перед выбором слова'}
              />
            )}
            {isCellOnly && (
              // Независимый от общего 👁 дорожки — гасит ТОЛЬКО подсветку+выбор этого клипа,
              // проявление текста (второй клип) продолжает работать как обычно.
              <button
                className="tlClipEye"
                onMouseDown={e => e.stopPropagation()}
                onClick={onToggleHighlight}
                title={highlightOn ? 'Выключить подсветку и выбор ячейки' : 'Включить подсветку и выбор ячейки'}
              >{highlightOn ? '👁' : '○'}</button>
            )}
            <div className="tlClipHandleL" onMouseDown={e => onHandleDown(e, 'left', clip, onUpdateClip)} />
            <div className="tlClipBody"    onMouseDown={e => onBodyDown(e, clip, onUpdateClip)} />
            <div className="tlClipHandleR" onMouseDown={e => onHandleDown(e, 'right', clip, onUpdateClip)} />
          </div>
        )}
        {revealClip && (
          <div
            className="tlClip tlClipReveal"
            style={{ left: `${timeToPct(revealClip.start)}%`, width: `${timeToPct(revealClip.end) - timeToPct(revealClip.start)}%` }}
            title="Проявление: когда текст ячейки виден (появляется/исчезает по краям)"
          >
            <div className="tlClipHandleL" onMouseDown={e => onHandleDown(e, 'left', revealClip, onUpdateReveal)} />
            <div className="tlClipBody"    onMouseDown={e => onBodyDown(e, revealClip, onUpdateReveal)} />
            <div className="tlClipHandleR" onMouseDown={e => onHandleDown(e, 'right', revealClip, onUpdateReveal)} />
          </div>
        )}
        <div className="tlCursor" style={{ left: `${cursorPct}%` }} />
      </div>
      {!layer.isDefault && (
        (!layer.word && !layer.isCheck)
          ? <button className="tlRemoveLayer" onClick={onRemove} title="Удалить дорожку">×</button>
          : <div className="tlRemovePlaceholder" />
      )}
    </div>
  )
}
