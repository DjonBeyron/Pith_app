import { useRef, useCallback } from 'react'
import { snapPoint, snapMove } from '../table-editor/timelineSnap.js'
import { startDragSession } from '../table-editor/timelineDrag.js'

// Дорожка пилюли в таймлайне игры «Повтори за диктором»: один клип = слово диктора. Начало клипа — начало слова (линия входит в пилюлю, она начинает заливаться),
// конец клипа — конец слова (пилюля залита); длина клипа задаёт скорость линии. Ручки — начало/конец, тело — сдвиг; края липнут к плейхеду и к краям соседних клипов (магнит, как у таблицы).
export default function WordLaneClipTrack({ index, clip, duration, stripPx, lit, snapAt = null, snapEdges = [], onUpdate }) {
  const stripRef = useRef(null)
  const toPct = useCallback(t => (duration ? (t / duration) * 100 : 0), [duration])
  const timeAt = e => {
    const r = stripRef.current?.getBoundingClientRect()
    return !r?.width || !duration ? 0 : Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration))
  }
  const stripWidth = () => stripRef.current?.getBoundingClientRect().width ?? 0
  const targets = () => (snapAt == null ? [] : [snapAt, ...snapEdges.filter(x => x.layerId !== index).map(x => x.t)])
  const snap = t => snapPoint(t, { targets: targets(), duration, stripWidth: stripWidth() })

  function onHandle(e, side) {
    e.preventDefault(); e.stopPropagation()
    const init = { ...clip }
    startDragSession(mv => {
      const t = snap(timeAt(mv))
      onUpdate(side === 'left'
        ? { start: Math.max(0, Math.min(t, init.end - 0.1)), end: init.end }
        : { start: init.start, end: Math.min(duration, Math.max(t, init.start + 0.1)) })
    })
  }

  function onBody(e) {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX
    const init = { ...clip }
    const len = init.end - init.start
    startDragSession(mv => {
      const r = stripRef.current?.getBoundingClientRect()
      if (!r?.width) return
      const free = Math.max(0, Math.min(duration - len, init.start + ((mv.clientX - x0) / r.width) * duration))
      const s = snapMove(free, len, { targets: targets(), duration, stripWidth: r.width })
      onUpdate({ start: s, end: s + len })
    })
  }

  return (
    <div className="tlTrack">
      <span className={`tlEye wlTlDot${lit ? ' wlTlDot--lit' : ''}`} aria-hidden="true">●</span>
      <div className="tlTrackLabel" title="Пилюля на дорожке игры">{`Пилюля ${index + 1}`}</div>
      <div className="tlTrackStrip" ref={stripRef} style={stripPx ? { minWidth: `${stripPx}px` } : undefined}>
        <div
          className="tlClip tlClipHighlight"
          style={{ left: `${toPct(clip.start)}%`, width: `${toPct(clip.end) - toPct(clip.start)}%` }}
          title="Слово диктора: от начала слова пилюля начинает заливаться, к концу слова она залита"
        >
          <div className="tlClipHandleL" onMouseDown={e => onHandle(e, 'left')} />
          <div className="tlClipBody" onMouseDown={onBody} />
          <div className="tlClipHandleR" onMouseDown={e => onHandle(e, 'right')} />
        </div>
      </div>
      <div className="tlRemovePlaceholder" />
    </div>
  )
}
