// «Дубль и зеркало»: одна полоса экрана сравнения («Пит» или «Ты»). Пилюли кусков — по таймингам (left/width в % ширины), пропущенный кусок — пунктирный «призрак», долгая пауза — подсвеченный зазор.
// Цвет пилюли — дорожка игры (кусок i → --lvl1..3). Стиль — rehearsal-mirror.css.
const secs = ms => `${(Math.round(ms / 100) / 10).toLocaleString('ru-RU')} с`

export default function MirrorLane({ who, lane, side }) {
  const { pills, gaps = [], durationMs, whole } = lane
  return (
    <section className="wlMirLane" data-side={side} aria-label={`Полоса: ${who}`}>
      <div className="wlMirHead"><b>{who}</b><span>{secs(durationMs)}</span></div>
      <div className="wlMirTrack">
        {gaps.map(g => <i key={g.left} className="wlMirGap" style={{ left: `${g.left}%`, width: `${g.width}%` }} />)}
        {whole && <span className="wlMirPill wlMirPill--whole" data-lane="0" style={{ left: 0, width: '100%' }} />}
        {pills.map(p => (
          <span key={`${p.i}${p.ghost ? 'g' : ''}`} className="wlMirPill" data-lane={p.i % 3} data-ghost={p.ghost || undefined} data-lit={lane.lit === p.i || undefined} style={{ left: `${p.left}%`, width: `${p.width}%` }}>{p.text}</span>
        ))}
      </div>
    </section>
  )
}
