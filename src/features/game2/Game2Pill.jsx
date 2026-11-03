import { memo } from 'react'

// Пилюля ленты «Мини-игры 2.0»: капсула с подписью слова (внешность — как .wlPill игры, game2-lane.css). Размер и место в дорожке считает game2Geometry.pillBox; состояние (lit / done / hit / miss) лента
// пишет прямо в data-state, минуя React (Game2Lane.mark), поэтому пилюля мемоизирована и после монтажа не перерисовывается. Подпись лежит всегда, а скрывает её CSS (data-labels на ленте):
// подсказка «По памяти» ставит пилюле data-label, и слово появляется без перерисовки. due — слово «к повтору» (обводка ярче и метка), small — служебное слово (мельче).
function Game2Pill({ p, box, tap = false }) {
  return (
    <div className="g2Pill" data-i={p.i} data-due={p.due || undefined} data-small={p.small || undefined} data-tap={tap || undefined} style={{ top: `${box.top}px`, height: `${box.height}px` }} data-testid={`g2-pill-${p.i}`}>
      <span className="g2PillFill" />
      <span className="g2PillText">{p.text}</span>
    </div>
  )
}

export default memo(Game2Pill)
