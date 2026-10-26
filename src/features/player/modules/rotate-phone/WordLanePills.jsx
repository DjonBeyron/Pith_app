import { PILLS, PILL_W, LANE_EDGES } from './wordLaneTimeline.js'

// Дорожки и пилюли игры. Три колонки разделены линиями; в каждой стоит вертикальная пустая пилюля (без надписей). Цвет и число обводок у пилюль — как у ступеней «Моей памяти»:
// 1-я зелёная с одной обводкой, 2-я синяя с двумя, 3-я фиолетовая с тремя (--lvl1…3, memory-levels.css). Пилюли стоят лесенкой: 1-я внизу, 2-я в центре, 3-я наверху.
// Заливку (--pK, 0…1) двигает линия (WordLaneLines) — здесь только форма. Лишнее слово ученика (misses растёт) — красная вспышка на ближайшей пустой пилюле: оверлей с key=misses
// перемонтируется и проигрывает анимацию заново, состояния для этого не нужно.
export default function WordLanePills({ hits, misses, visible }) {
  return (
    <>
      <div className={`wlLanes${visible ? ' wlLanes--in' : ''}`} aria-hidden="true" data-testid="wl-lanes">
        <i /><i /><i />
        {LANE_EDGES.map(x => <b key={x} className="wlLaneEdge" style={{ left: `${x}%` }} />)}
      </div>
      {PILLS.map((p, i) => (
        <div
          key={i}
          className={`wlPill wlPill--${i + 1}${visible ? ' wlPill--in' : ''}`}
          style={{ left: `${p.x}%`, top: `${p.top}%`, width: `${PILL_W}%`, height: `${p.bottom - p.top}%`, '--i': i, '--pv': `var(--p${i})` }}
          data-testid={`wl-pill-${i}`}
        >
          <span className="wlPillClip">
            <span className="wlPillFill" />
            {misses > 0 && i === hits && <span key={misses} className="wlMiss" />}
          </span>
        </div>
      ))}
    </>
  )
}
