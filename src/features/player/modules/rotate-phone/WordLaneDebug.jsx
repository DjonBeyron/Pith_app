import { LANES_X, SLOTS, WORD_Y, LINE_START_Y, speakTarget, SLOT_COUNT } from './wordLaneTimeline.js'

// Отладочные опорные точки геометрии игры (включаются isWordLaneDebug: localStorage pithy_wl_debug=1 или ?wldebug в адресе). Рисуются поверх сцены в тех же процентах:
// ● середины дорожек и слов (x), ■ центры слоёв, ◆ точки ожидания линии ученика (speakTarget), ▸ опорные точки головы в фазе диктора (t мс → y %), ○ голова линии прямо сейчас
// (читает ту же CSS-переменную --front, что и маска линий). Нужны, чтобы сверять раскладку глазами и на скриншотах; ученику не показываются.
const dot = (x, y, cls, label) => (
  <div key={`${cls}${x}${y}`} className={`wlDbg wlDbg--${cls}`} style={{ left: `${x}%`, top: `${y}%` }}>
    <span>{label}</span>
  </div>
)

export default function WordLaneDebug({ anchors }) {
  return (
    <div className="wlDbgLayer" aria-hidden="true" data-testid="wl-debug">
      {dot(50, WORD_Y, 'word', `слово 50,${WORD_Y}`)}
      {dot(50, LINE_START_Y, 'start', `старт линии 50,${LINE_START_Y}`)}
      {LANES_X.map(x => dot(x, 96, 'lane', `x${x}`))}
      {SLOTS.map((p, i) => dot(p.x, p.y, 'slot', `слой${i} ${p.x},${p.y}`))}
      {Array.from({ length: SLOT_COUNT }, (_, k) => dot(SLOTS[k].x, speakTarget(k), 'hold', `ожид${k} y${speakTarget(k)}`))}
      {anchors.map(([t, y]) => dot(2, Math.min(y, 98), 'anchor', `${t}мс y${y}`))}
      <div className="wlDbg wlDbg--head" style={{ left: '50%', top: 'var(--front, 0%)' }}><span>голова</span></div>
    </div>
  )
}
