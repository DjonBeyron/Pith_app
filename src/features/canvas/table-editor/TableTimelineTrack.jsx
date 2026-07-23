import { useRef, useCallback } from 'react'
import { EXTRA_LEAD_IN_S } from '../../../shared/lib/tableDictatorTiming.js'

// Одна дорожка таймлайна. Один клип с ручками ресайза и перетаскиванием тела.
// isDefault-слои не имеют кнопки удаления.
export default function TableTimelineTrack({ layer, cells, duration, currentTime, stripPx, onToggleVisible, onUpdateClip, onRemove }) {
  const cell  = cells.find(c => c.id === layer.cellId)
  const clip  = layer.clips[0] ?? null
  const stripRef = useRef(null)

  const getTime = useCallback((e) => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !duration) return 0
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  function onHandleDown(e, side) {
    e.stopPropagation()
    if (!clip || !duration) return
    const init = { ...clip }
    const onMove = mv => {
      const t = getTime(mv)
      if (side === 'left') {
        onUpdateClip({ start: Math.max(0, Math.min(t, init.end - 0.05)), end: init.end })
      } else {
        onUpdateClip({ start: init.start, end: Math.min(duration, Math.max(t, init.start + 0.05)) })
      }
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onBodyDown(e) {
    e.stopPropagation()
    if (!clip || !duration) return
    const startX = e.clientX
    const init = { ...clip }
    const clipDur = init.end - init.start
    const onMove = mv => {
      const rect = stripRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = ((mv.clientX - startX) / rect.width) * duration
      const s = Math.max(0, Math.min(duration - clipDur, init.start + dx))
      onUpdateClip({ start: s, end: s + clipDur })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const timeToPct = useCallback(t => (duration ? t / duration * 100 : 0), [duration])
  const isOrphan = !layer.word && !cell && !layer.isCheck

  // Для word-слоя: начало клипа = старт анимации (слайд+список), реальный «выбор»
  // (зелёный) — только после EXTRA_LEAD_IN_S. Показываем этот кусок другим цветом —
  // длина куска фиксирована, растягивание/сужение клипа её не меняет, только сдвигает
  // во времени (клип короче лид-ина — кусок просто займёт клип целиком).
  let leadInPct = null
  if (layer.word && clip) {
    const clipDur = clip.end - clip.start
    if (clipDur > 0) {
      const leadInEnd = Math.min(clip.end, clip.start + EXTRA_LEAD_IN_S)
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
    <div className={`tlTrack${!layer.visible ? ' tlTrackHidden' : ''}${layer.word ? ' tlTrackWord' : ''}${layer.isCheck ? ' tlTrackCheck' : ''}${isOrphan ? ' tlTrackOrphan' : ''}`}>
      <button className="tlEye" onClick={onToggleVisible} title={layer.visible ? 'Скрыть' : 'Показать'}>
        {layer.visible ? '👁' : '○'}
      </button>
      <div className="tlTrackLabel" title={cell?.value}>{label}</div>
      <div className="tlTrackStrip" ref={stripRef} style={stripPx ? { minWidth: `${stripPx}px` } : undefined}>
        {clip && (
          <div
            className="tlClip"
            style={{ left: `${timeToPct(clip.start)}%`, width: `${timeToPct(clip.end) - timeToPct(clip.start)}%` }}
          >
            {leadInPct != null && (
              <div className="tlClipLeadIn" style={{ width: `${leadInPct}%` }} title="Анимация + пауза перед выбором слова" />
            )}
            <div className="tlClipHandleL" onMouseDown={e => onHandleDown(e, 'left')} />
            <div className="tlClipBody"    onMouseDown={onBodyDown} />
            <div className="tlClipHandleR" onMouseDown={e => onHandleDown(e, 'right')} />
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
