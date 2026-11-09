import { PILL_W, PILL_H, LANE_X, SLOT_COUNT } from './wordLaneTimeline.js'
import { POOL } from './wordLanePool.js'

// Разметка пула пилюль (POOL одинаковых капсул) — одна на игру (WordLanePills.jsx) и стенд пилюль (features/pillstand): движок пула (wordLanePool.js) находит их по [data-pill]
// и пишет им стили и атрибуты прямо в DOM. Контур, клип заливки (.wlPillClip: тень слова, заливка, метка темпа) и искры (.wlPillSparks, вне клипа) — word-lane-pill.css.
export default function WordLanePillEls({ count = POOL, testid = 'wl-pill' }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} data-pill className="wlPill" data-lane={i % SLOT_COUNT} style={{ left: `${LANE_X[i % SLOT_COUNT]}%`, width: `${PILL_W}%`, height: `${PILL_H}%` }} data-testid={`${testid}-${i}`}>
      <span className="wlPillClip">
        <span className="wlGhost" />
        <span className="wlPillFill" />
        <span className="wlPace" />
      </span>
      <span className="wlPillSparks"><i><b /><b /></i></span>
    </div>
  ))
}
