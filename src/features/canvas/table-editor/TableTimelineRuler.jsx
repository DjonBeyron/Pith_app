import { useRef, useCallback } from 'react'
import { startDragSession } from './timelineDrag.js'

// Линейка времени над дорожками таймлайна (как в Premiere Pro):
// крупная засечка с подписью на каждой секунде, средняя на 0.5с, мелкие каждые 0.1с.
// Клик/протяжка по линейке двигает плейхед — ставит currentTime самого <audio>,
// поэтому play/пробел продолжат ровно с этого места. Сама линия плейхеда (синяя,
// .tlCursor) рисуется ОДИН раз в TableTimelineEditor поверх линейки+дорожек —
// не здесь: если рисовать её в каждой дорожке отдельно, она рвётся на отступах
// между дорожками (у каждой свой кусок, обрезанный по высоте её строки).
// Выровнена по стрипу дорожек теми же спейсерами, что и спектр (см. tlWaveSpacer).
export default function TableTimelineRuler({ duration, stripPx, onSeek, onResize, stripRef: outerRef, snapOn, onToggleSnap }) {
  const innerRef = useRef(null)
  // Полосу линейки знает и редактор — по ней он считает время при протяжке
  // за сам плейхед (иначе пришлось бы дублировать пересчёт координат)
  const stripRef = outerRef ?? innerRef

  const getTime = useCallback((e) => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !duration) return 0
    return Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  // Длину композиции можно не только вписать числом в шапке, но и подрезать
  // прямо на линейке — потянув за её конец, как за край клипа. Масштаб
  // (пикселей на секунду) фиксируем на момент захвата: иначе полоса тянулась
  // бы сама за собой и длина «убегала» от курсора.
  function startResize(e) {
    e.preventDefault()
    e.stopPropagation()
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect?.width || !duration || !onResize) return
    const pxPerSec = rect.width / duration
    startDragSession(mv => {
      const sec = Math.round((mv.clientX - rect.left) / pxPerSec)
      onResize(Math.max(1, Math.min(600, sec)))
    })
  }

  function onDown(e) {
    // preventDefault — иначе протяжка по линейке тянет выделение её подписей
    e.preventDefault()
    onSeek?.(getTime(e))
    startDragSession(mv => onSeek?.(getTime(mv)))
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
      {/* Левый спейсер линейки стоит ровно над колонкой названий дорожек —
          сюда и просится магнит: он про клипы всех дорожек сразу */}
      <div className="tlWaveSpacer tlRulerCorner">
        {onToggleSnap && (
          <button
            className={`tlSnapBtn${snapOn ? ' tlSnapBtnOn' : ''}`}
            onClick={onToggleSnap}
            title={snapOn
              ? 'Магнит включён: края клипов липнут к синему флажку'
              : 'Магнит выключен: клипы двигаются свободно'}
          >🧲</button>
        )}
      </div>
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
        {onResize && (
          <div
            className="tlRulerEnd"
            title="Потяните, чтобы подрезать длину композиции"
            onMouseDown={startResize}
          />
        )}
      </div>
      <div className="tlWaveSpacerR" />
    </div>
  )
}
