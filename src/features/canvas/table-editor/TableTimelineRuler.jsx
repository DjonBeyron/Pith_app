// Линейка времени над дорожками таймлайна (как в Premiere Pro):
// крупная засечка с подписью на каждой секунде, средняя на 0.5с, мелкие каждые 0.1с.
// Выровнена по стрипу дорожек теми же спейсерами (88px слева, 20px справа), что и спектр.
export default function TableTimelineRuler({ duration, stripPx }) {
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
      <div className="tlRulerStrip" style={{ minWidth: `${stripPx}px` }}>
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
