import { useRef, useCallback, useState } from 'react'
import { wordGreenAt } from '../../../shared/lib/tableDictatorTiming.js'
import { snapPoint, snapMove } from './timelineSnap.js'
import { startDragSession } from './timelineDrag.js'
import ClipMenu from './ClipMenu.jsx'

// Одна дорожка таймлайна. У cell-слоя — два независимых клипа в одной строке:
// подсветка (как раньше) и проявление (серый, когда текст ячейки виден/скрыт).
// У word/check-слоя — как раньше, один клип. isDefault-слои без кнопки удаления.
export default function TableTimelineTrack({
  // snapAt — время плейхеда, к которому липнут края клипов (магнит в шапке
  // включён). null — магнит выключен, клипы двигаются свободно
  layer, cells, duration, stripPx, extrasStart, snapAt = null,
  onToggleVisible, onToggleHighlight, onToggleCollect, onPick,
  onUpdateClip, onUpdateReveal, onUpdateExtra, onDuplicate, onAddClear, onRemoveExtra, onRemove,
}) {
  // Меню клипа: одна кнопка ▾ вместо россыпи иконок на самом клипе
  const [menuRect, setMenuRect] = useState(null)
  const cell  = cells.find(c => c.id === layer.cellId)
  const isCellOnly  = !!layer.cellId && !layer.word && !layer.isCheck && !layer.isClear
  const clip        = layer.clips[0] ?? null
  const revealClip  = isCellOnly ? (layer.clips[1] ?? null) : null
  const highlightOn = layer.highlightOn !== false
  const stripRef = useRef(null)

  const getTime = useCallback((e) => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !duration) return 0
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  // Ширина полосы нужна магниту: порог примагничивания задан в пикселях
  const stripWidth = () => stripRef.current?.getBoundingClientRect().width ?? 0
  const snap = t => snapPoint(t, { playhead: snapAt, duration, stripWidth: stripWidth() })

  function onHandleDown(e, side, targetClip, onUpdate) {
    e.preventDefault()   // без этого браузер начинает своё выделение/drag, и mouseup теряется
    e.stopPropagation()
    if (!targetClip || !duration) return
    const init = { ...targetClip }
    startDragSession(mv => {
      const t = snap(getTime(mv))
      if (side === 'left') {
        onUpdate({ start: Math.max(0, Math.min(t, init.end - 0.05)), end: init.end })
      } else {
        onUpdate({ start: init.start, end: Math.min(duration, Math.max(t, init.start + 0.05)) })
      }
    })
  }

  function onBodyDown(e, targetClip, onUpdate) {
    e.preventDefault()
    e.stopPropagation()
    if (!targetClip || !duration) return
    const startX = e.clientX
    const init = { ...targetClip }
    const clipDur = init.end - init.start
    startDragSession(mv => {
      const rect = stripRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = ((mv.clientX - startX) / rect.width) * duration
      const free = Math.max(0, Math.min(duration - clipDur, init.start + dx))
      // Магнит: к флажку липнет тот край клипа, который к нему ближе
      const s = snapMove(free, clipDur, { playhead: snapAt, duration, stripWidth: rect.width })
      onUpdate({ start: s, end: s + clipDur })
    })
  }

  const timeToPct = useCallback(t => (duration ? t / duration * 100 : 0), [duration])
  const isOrphan = !layer.word && !cell && !layer.isCheck && !layer.isClear
  const collect  = layer.collect !== false
  // Особая ячейка: в уроке из неё выпадает меню, а в авто-режиме нужный
  // вариант выбирает автор — прямо здесь, на зелёном клипе
  const options  = cell?.options ?? []

  // Для word-слоя: начало клипа = старт анимации (слайд+список), реальный «выбор»
  // (зелёный) — только после лид-ина. Показываем этот кусок другим цветом — длина
  // куска фиксирована, растягивание/сужение клипа её не меняет, только сдвигает во
  // времени (клип короче лид-ина — кусок просто займёт клип целиком).
  // Лид-ин слова упирается в конец отъезда таблицы и в конец клипа — он
  // дополнительно ждёт конец отъезда таблицы влево (TABLE_SLIDE_S), см. tableDictatorTiming.js.
  let leadInPct = null
  if (layer.word && clip) {
    const clipDur = clip.end - clip.start
    if (clipDur > 0) {
      // Ровно та же формула, что и в плеере: лид-ин упирается в конец клипа,
      // оставляя слову минимум свечения (wordGreenAt)
      const leadInEnd = wordGreenAt(clip, extrasStart)
      leadInPct = Math.min(100, (leadInEnd - clip.start) / clipDur * 100)
    }
  }
  const label = layer.isClear
    ? '⌫ Очистить'
    : layer.isCheck
    ? '✓ Проверить'
    : layer.word
      ? `"${layer.word}"`
      : cell?.value?.trim() || (cell ? `${cell.row + 1}×${cell.col + 1}` : '⚠ удали')

  return (
    <div className={`tlTrack${!layer.visible ? ' tlTrackHidden' : ''}${layer.word ? ' tlTrackWord' : ''}${layer.isCheck ? ' tlTrackCheck' : ''}${layer.isClear ? ' tlTrackClear' : ''}${isCellOnly ? ' tlTrackCell' : ''}${isOrphan ? ' tlTrackOrphan' : ''}`}>
      <button className="tlEye" onClick={onToggleVisible} title={layer.visible ? 'Скрыть' : 'Показать'}>
        {layer.visible ? '👁' : '○'}
      </button>
      <div className="tlTrackLabel" title={cell?.value}>{label}</div>
      <div className={`tlTrackStrip${isCellOnly ? ' tlTrackStripDual' : ''}`} ref={stripRef} style={stripPx ? { minWidth: `${stripPx}px` } : undefined}>
        {clip && (
          <div
            className={`tlClip${isCellOnly ? ' tlClipHighlight' : ''}${isCellOnly && !highlightOn ? ' tlClipHighlightOff' : ''}${layer.isClear ? ' tlClipClear' : ''}`}
            style={{ left: `${timeToPct(clip.start)}%`, width: `${timeToPct(clip.end) - timeToPct(clip.start)}%` }}
            title={layer.isClear ? 'Здесь собранная фраза очищается'
              : isCellOnly ? 'Подсветка зелёным + выбор ячейки в ответ' : undefined}
          >
            {leadInPct != null && (
              <div
                className="tlClipLeadIn"
                style={{ width: `${leadInPct}%` }}
                title="Анимация + пауза перед выбором слова (не раньше, чем уедет таблица)"
              />
            )}
            {/* Одна кнопка на клип: сборка фразы, повтор анимации, очистка */}
            {!layer.isClear && (
              <button
                className={`tlClipMenuBtn${!layer.isCheck && !collect ? ' tlClipMenuBtnOff' : ''}`}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setMenuRect(e.currentTarget.getBoundingClientRect()) }}
                title="Что делать с этим слоем"
              >▾</button>
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
            {options.length > 0 && (
              <select
                className="tlClipPick"
                value={layer.pick ?? ''}
                title="Что из особых значений уйдёт в собранную фразу"
                onMouseDown={e => e.stopPropagation()}
                onChange={e => onPick?.(e.target.value)}
              >
                <option value="">— вариант —</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            <div className="tlClipHandleL" onMouseDown={e => onHandleDown(e, 'left', clip, onUpdateClip)} />
            <div className="tlClipBody"    onMouseDown={e => onBodyDown(e, clip, onUpdateClip)} />
            <div className="tlClipHandleR" onMouseDown={e => onHandleDown(e, 'right', clip, onUpdateClip)} />
          </div>
        )}
        {(layer.repeats ?? []).map((rep, i) => (
          <div
            key={`rep-${i}`}
            className={`tlClip${isCellOnly ? ' tlClipHighlight' : ''} tlClipRepeat`}
            style={{ left: `${timeToPct(rep.start)}%`, width: `${timeToPct(rep.end) - timeToPct(rep.start)}%` }}
            title="Повтор той же анимации"
          >
            <button
              className="tlClipDrop"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRemoveExtra?.('repeats', i) }}
              title="Убрать повтор"
            >×</button>
            <div className="tlClipHandleL" onMouseDown={e => onHandleDown(e, 'left', rep, c => onUpdateExtra?.('repeats', i, c))} />
            <div className="tlClipBody"    onMouseDown={e => onBodyDown(e, rep, c => onUpdateExtra?.('repeats', i, c))} />
            <div className="tlClipHandleR" onMouseDown={e => onHandleDown(e, 'right', rep, c => onUpdateExtra?.('repeats', i, c))} />
          </div>
        ))}

        {(layer.clears ?? []).map((cl, i) => (
          <div
            key={`clr-${i}`}
            className="tlClip tlClipClear"
            style={{ left: `${timeToPct(cl.start)}%`, width: `${timeToPct(cl.end) - timeToPct(cl.start)}%` }}
            title="В начале этого клипа собранная фраза очищается"
          >
            <button
              className="tlClipDrop"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRemoveExtra?.('clears', i) }}
              title="Убрать очистку"
            >×</button>
            <div className="tlClipHandleL" onMouseDown={e => onHandleDown(e, 'left', cl, c => onUpdateExtra?.('clears', i, c))} />
            <div className="tlClipBody"    onMouseDown={e => onBodyDown(e, cl, c => onUpdateExtra?.('clears', i, c))} />
            <div className="tlClipHandleR" onMouseDown={e => onHandleDown(e, 'right', cl, c => onUpdateExtra?.('clears', i, c))} />
          </div>
        ))}

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
      </div>
      <ClipMenu
        rect={menuRect}
        collect={collect}
        canCollect={!layer.isCheck && !layer.isClear}
        onToggleCollect={onToggleCollect}
        onDuplicate={onDuplicate}
        onClear={onAddClear}
        onClose={() => setMenuRect(null)}
      />
      {/* Правая колонка есть у КАЖДОЙ дорожки, даже когда удалять нечего:
          без неё полоса такой дорожки была на 26px шире остальных, и её клипы
          стояли в другом масштабе — плейхед и линейка с ними не совпадали */}
      {!layer.isDefault && !layer.word && !layer.isCheck
        ? <button className="tlRemoveLayer" onClick={onRemove} title="Удалить дорожку">×</button>
        : <div className="tlRemovePlaceholder" />}
    </div>
  )
}
