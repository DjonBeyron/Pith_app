import { useRef, useCallback } from 'react'

// Линейка времени над дорожками таймлайна (как в Premiere Pro):
// крупная засечка с подписью на каждой секунде, средняя на 0.5с, мелкие каждые 0.1с.
// Клик/протяжка по линейке двигает плейхед — ставит currentTime самого <audio>,
// поэтому play/пробел продолжат ровно с этого места. Сама линия плейхеда (синяя,
// .tlCursor) рисуется ОДИН раз в TableTimelineEditor поверх линейки+дорожек —
// не здесь: если рисовать её в каждой дорожке отдельно, она рвётся на отступах
// между дорожками (у каждой свой кусок, обрезанный по высоте её строки).
// Выровнена по стрипу дорожек теми же спейсерами, что и спектр (см. tlWaveSpacer).
export default function TableTimelineRuler({ duration, stripPx, onSeek }) {
  const stripRef = useRef(null)

  const getTime = useCallback((e) => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !duration) return 0
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  function onDown(e) {
    onSeek?.(getTime(e))
    const onMove = mv => onSeek?.(getTime(mv))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!duration) return null

  const ticks = []
  const count = Math.floor(duration / 0.1 + 1e-4)
  for (let i = 0; i <= count; i++) {
    const t      = i * 0.1
    const isSec  = Math.abs(t - Math.round(t)) < 1e-3
    const isHalf = !isSec && Math.abs((Math.round(t * 10) % 5)) < 1e-3
    ticks.push({ t, pct: (t / duration) * 100, isSec, isHalf })
  }
  return (
    <div className="tlRuler">
      <div className="tlWaveSpacer" />
      <div className="tlRulerStrip" ref={stripRef} onMouseDown={onDown} style={{ minWidth: `${stripPx}px` }}>
        {ticks.map((tk, i) => (
          <div
            key={i}
            className={`tlTick${tk.isSec ? ' tlTickSec' : tk.isHalf ? ' tlTickHalf' : ''}`}
            style={{ left: `${tk.pct}%` }}
          >
            {tk.isSec && <span className="tlTickLabel">{Math.round(tk.t)}s</span>}
          </div>
        ))}
      </div>
      <div className="tlWaveSpacerR" />
    </div>
  )
}
