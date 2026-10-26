import { LANE_X, LANE_EDGES, PILLS, WORD_Y, LINE_START_Y, speakTarget, SLOT_COUNT } from './wordLaneTimeline.js'

// Отладочные опорные точки геометрии игры (включаются isWordLaneDebug: localStorage pithy_wl_debug=1 или ?wldebug в адресе). Рисуются поверх сцены в тех же процентах:
// ● центр слова и середины дорожек (x), ┃ разделители дорожек, ■ верх и низ каждой пилюли (низ — вход линии = начало слова, верх — конец слова), ◆ точки ожидания линии ученика
// (speakTarget), ▸ опорные точки времени головы линии (t мс → y %) у левого края, ○ голова линии прямо сейчас (читает ту же CSS-переменную --front, что и сама линия).
// Нужны, чтобы сверять раскладку глазами и на скриншотах; ученику не показываются.
const dot = (x, y, cls, label) => (
  <div key={`${cls}${x}${y}${label}`} className={`wlDbg wlDbg--${cls}`} style={{ left: `${x}%`, top: `${y}%` }}>
    <span>{label}</span>
  </div>
)

export default function WordLaneDebug({ anchors }) {
  const r = v => Math.round(v * 10) / 10
  return (
    <div className="wlDbgLayer" aria-hidden="true" data-testid="wl-debug">
      {dot(50, WORD_Y, 'word', `слово 50,${WORD_Y}`)}
      {dot(50, LINE_START_Y - 12, 'start', `старт линии y${LINE_START_Y}`)}
      {LANE_X.map((x, i) => dot(x, 96, 'lane', `дор.${i + 1} x${r(x)}`))}
      {LANE_EDGES.map(x => dot(x, 2, 'lane', `${r(x)}`))}
      {PILLS.map((p, i) => [
        dot(p.x, p.top, 'slot', `п${i + 1} верх y${p.top}`),
        dot(p.x, p.bottom, 'slot', `п${i + 1} низ y${p.bottom}`),
      ])}
      {Array.from({ length: SLOT_COUNT }, (_, k) => dot(PILLS[k].x + 8, speakTarget(k), 'hold', `ожид${k + 1}`))}
      {anchors.map(([t, y]) => dot(2, Math.max(0, Math.min(y, 98)), 'anchor', `${t}мс y${r(y)}`))}
      <div className="wlDbg wlDbg--head" style={{ left: '50%', top: 'var(--front, 106%)' }}><span>голова</span></div>
    </div>
  )
}
