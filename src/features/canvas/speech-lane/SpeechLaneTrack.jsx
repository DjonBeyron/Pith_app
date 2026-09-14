import { useRef, useCallback } from 'react'
import { snapPoint, snapMove } from '../table-editor/timelineSnap.js'
import { startDragSession } from '../table-editor/timelineDrag.js'
import { shotKey, isTranslation } from '../../../shared/lib/speechLaneTiming.js'

// Дорожка в тренажёре: слева роль (🟢 диктор / 🔴 ученик — клик переключает;
// 💬 перевод — отдельная независимая дорожка, роль не меняется), номер дорожки
// экрана (1/2/3 — клик по кругу; у перевода нет — он поверх круга), текст
// (правится на месте); справа вылеты — clips[0] и повторы. Клип слова —
// полёт сверху вниз; клип перевода — сколько он висит на экране. Окно, когда
// слово реально звучит в озвучке, нарисовано на клипе светлой полосой
// (litWindows). Наложение на другой вылет в той же дорожке экрана — красная
// рамка (laneCollisions). ⧉ слева, рядом с 👁 — копия всей дорожки.
export default function SpeechLaneTrack({
  layer, duration, stripPx, lit, collisions, snapAt = null, snapEdges = [],
  onToggleVisible, onToggleRole, onCycleLane, onEdit,
  onUpdateClip, onUpdateRepeat, onDuplicate, onRemoveRepeat, onRemove, onDuplicateLayer,
}) {
  const stripRef = useRef(null)
  const clip = layer.clips[0] ?? null
  const isUser = layer.role === 'user'
  const isTr = isTranslation(layer)

  const getTime = useCallback(e => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect?.width || !duration) return 0
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  const stripWidth = () => stripRef.current?.getBoundingClientRect().width ?? 0
  const targets = () => (snapAt == null ? [] : [snapAt, ...snapEdges.filter(e => e.layerId !== layer.id).map(e => e.t)])
  const snap = t => snapPoint(t, { targets: targets(), duration, stripWidth: stripWidth() })

  function onHandleDown(e, side, target, onUpdate) {
    e.preventDefault(); e.stopPropagation()
    const init = { ...target }
    startDragSession(mv => {
      const t = snap(getTime(mv))
      if (side === 'left') onUpdate({ start: Math.max(0, Math.min(t, init.end - 0.2)), end: init.end })
      else onUpdate({ start: init.start, end: Math.min(duration, Math.max(t, init.start + 0.2)) })
    })
  }

  function onBodyDown(e, target, onUpdate) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const init = { ...target }
    const len = init.end - init.start
    startDragSession(mv => {
      const rect = stripRef.current?.getBoundingClientRect()
      if (!rect?.width) return
      const dx = ((mv.clientX - startX) / rect.width) * duration
      const free = Math.max(0, Math.min(duration - len, init.start + dx))
      const s = snapMove(free, len, { targets: targets(), duration, stripWidth: rect.width })
      onUpdate({ start: s, end: s + len })
    })
  }

  const pct = t => (duration ? (t / duration) * 100 : 0)

  function renderShot(shot, i, onUpdate) {
    const key = shotKey(layer.id, i)
    const win = lit?.get(key)
    const dur = shot.end - shot.start
    const litStyle = win && dur > 0 ? {
      left: `${Math.max(0, (win.start - shot.start) / dur * 100)}%`,
      width: `${Math.min(100, (win.end - Math.max(win.start, shot.start)) / dur * 100)}%`,
    } : null
    return (
      <div key={key}
        className={`tlClip slClip${isUser ? ' slClipUser' : ''}${isTr ? ' slClipTr' : ''}${i > 0 ? ' tlClipRepeat' : ''}${collisions?.has(key) ? ' slClipCollide' : ''}`}
        style={{ left: `${pct(shot.start)}%`, width: `${pct(shot.end) - pct(shot.start)}%` }}
        title={collisions?.has(key) ? 'Накладывается на другое слово в этой же дорожке экрана' : isTr ? 'Перевод висит поверх круга, пока длится клип' : i > 0 ? 'Повтор' : 'Полёт слова сверху вниз; середина — проход через круг'}>
        {litStyle && !isTr && (
          <div className={`slClipLit${win.fallback ? ' slClipLitGuess' : ''}${win.bound ? ' slClipLitBound' : ''}`} style={litStyle}
            title={win.bound ? 'Горит по привязке к куску озвучки' : win.fallback ? 'В озвучке это слово здесь не найдено — горит у круга' : 'Здесь слово звучит в озвучке'} />
        )}
        {i === 0
          ? <button className="slClipDup" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDuplicate() }} title="Повторить вылет ещё раз">⧉</button>
          : <button className="tlClipDrop" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemoveRepeat(i - 1) }} title="Убрать повтор">×</button>}
        <div className="tlClipHandleL" onMouseDown={e => onHandleDown(e, 'left', shot, onUpdate)} />
        <div className="tlClipBody"    onMouseDown={e => onBodyDown(e, shot, onUpdate)} />
        <div className="tlClipHandleR" onMouseDown={e => onHandleDown(e, 'right', shot, onUpdate)} />
      </div>
    )
  }

  return (
    <div className={`tlTrack slTrack${!layer.visible ? ' tlTrackHidden' : ''}${isUser ? ' slTrackUser' : ''}${isTr ? ' slTrackTr' : ''}`}>
      <button className="tlEye" onClick={onToggleVisible} title={layer.visible ? 'Скрыть' : 'Показать'}>
        {layer.visible ? '👁' : '○'}
      </button>
      <button className="tlEye slDupLayer" onClick={onDuplicateLayer} title="Дублировать дорожку (копия встанет следом)">⧉</button>
      {isTr ? (
        <span className="slRoleBtn slRoleBtnTr" title="Перевод — показывается поверх круга">💬</span>
      ) : (
        <button className={`slRoleBtn${isUser ? ' slRoleBtnUser' : ''}`} onClick={onToggleRole}
          title={isUser ? 'Говорит ученик — сделать слоем диктора' : 'Говорит диктор — сделать слоем ученика'}>
          {isUser ? '🔴' : '🟢'}
        </button>
      )}
      {isTr ? (
        <span className="slLaneBtn slLaneBtnOff" title="У перевода нет дорожки экрана — он по центру">—</span>
      ) : (
        <button className="slLaneBtn" onClick={onCycleLane} title="Дорожка экрана (1 — левая, 3 — правая)">
          {(layer.lane ?? 0) + 1}
        </button>
      )}
      <div className="tlTrackLabel slLabel">
        <input className="slLabelText" value={layer.text} placeholder={isTr ? 'перевод' : 'слово'}
          onChange={e => onEdit({ text: e.target.value })} onMouseDown={e => e.stopPropagation()} />
      </div>
      <div className="tlTrackStrip" ref={stripRef} style={stripPx ? { minWidth: `${stripPx}px` } : undefined}>
        {clip && renderShot(clip, 0, onUpdateClip)}
        {(layer.repeats ?? []).map((rep, i) => renderShot(rep, i + 1, c => onUpdateRepeat(i, c)))}
      </div>
      <button className="tlRemoveLayer" onClick={onRemove} title="Удалить дорожку">×</button>
    </div>
  )
}
