import { useRef } from 'react'
import { PILL_W, PILL_H, LANE_X, LANE_EDGES, SLOT_COUNT } from './wordLaneTimeline.js'
import { useWordLanePills } from './useWordLanePills.js'

// Дорожки и пилюли игры. Три колонки разделены линиями; в каждой — вертикальная пустая пилюля (без надписей), которая по очереди опускается в зону голоса (useWordLanePills).
// Цвет и число обводок — как у ступеней «Моей памяти»: 1-я зелёная с одной обводкой, 2-я синяя с двумя, 3-я фиолетовая с тремя (--lvl1…3, memory-levels.css).
// Под словом три «огонька» прогресса — зажигаются, когда пилюля защёлкнулась. Лишнее слово ученика (misses растёт) — красная вспышка на текущей пилюле: оверлей с key=misses
// перемонтируется и проигрывает анимацию заново, состояния для этого не нужно. Положение и заливка пилюль приходят из движка через --y и --pv.
// Подсказка ученику (видна только в фазе ученика): «тень» слова диктора внутри пилюли — полоски, ширина которых повторяет громкость слова снизу вверх (длинная полоска — громкий кусок),
// и метка темпа --pace — чёрточка, которая бежит вверх в темпе диктора с первого звука ученика: наливай голосом так, чтобы заливка шла вровень с меткой.
export default function WordLanePills({ phase, phaseAt, plan, hits, misses, levels, fx, visible }) {
  const rootRef = useRef(null)
  useWordLanePills(rootRef, { phase, phaseAt, plan, hits, misses, levels, fx })
  return (
    <div ref={rootRef} className="wlField" data-testid="wl-field">
      <div className={`wlLanes${visible ? ' wlLanes--in' : ''}`} aria-hidden="true" data-testid="wl-lanes">
        <i /><i /><i />
        {LANE_EDGES.map(x => <b key={x} className="wlLaneEdge" style={{ left: `${x}%` }} />)}
      </div>
      <div className={`wlDots${visible ? ' wlDots--in' : ''}`} aria-hidden="true">
        {Array.from({ length: SLOT_COUNT }, (_, k) => <span key={k} data-dot className={`wlDot wlDot--${k + 1}`} />)}
      </div>
      {LANE_X.map((x, i) => (
        <div key={i} data-pill className={`wlPill wlPill--${i + 1}`} style={{ left: `${x}%`, width: `${PILL_W}%`, height: `${PILL_H}%` }} data-testid={`wl-pill-${i}`}>
          <span className="wlPillClip">
            <span className="wlGhost">{plan.profiles[i].map((v, j) => <i key={j} style={{ width: `${30 + 60 * v}%` }} />)}</span>
            <span className="wlPillFill" />
            <span className="wlPace" />
            {misses > 0 && i === hits && <span key={misses} className="wlMiss" />}
          </span>
        </div>
      ))}
    </div>
  )
}
