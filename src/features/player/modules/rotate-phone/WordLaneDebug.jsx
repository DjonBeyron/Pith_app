import { LANE_X, LANE_EDGES, WORD_Y, ZONE_Y, ENTER_Y, EXIT_Y, PILL_H, SPEED } from './wordLaneTimeline.js'

// Отладочные опорные точки геометрии игры (включаются isWordLaneDebug: localStorage pithy_wl_debug=1 или ?wldebug в адресе). Рисуются поверх сцены в тех же процентах:
// ● центр слова и середины дорожек (x), ┃ разделители дорожек, ■ центр зоны голоса (где пилюля стоит, пока звучит слово, и верх/низ пилюли в ней), ▸ откуда пилюля выплывает
// (ENTER_Y) и куда уходит (EXIT_Y), ◆ окно слова k вокруг центра (где пилюля в начале и в конце слова: SPEED·длина/2), а слева — время плана: когда слово k начинается и кончается
// (мс от старта фазы диктора). Ученику не показываются.
const dot = (x, y, cls, label) => (
  <div key={`${cls}${x}${y}${label}`} className={`wlDbg wlDbg--${cls}`} style={{ left: `${x}%`, top: `${y}%` }}>
    <span>{label}</span>
  </div>
)

export default function WordLaneDebug({ plan }) {
  const r = v => Math.round(v * 10) / 10
  return (
    <div className="wlDbgLayer" aria-hidden="true" data-testid="wl-debug">
      {dot(50, WORD_Y, 'word', `слово 50,${WORD_Y}`)}
      {LANE_X.map((x, i) => dot(x, 96, 'lane', `дор.${i + 1} x${r(x)}`))}
      {LANE_EDGES.map(x => dot(x, 2, 'lane', `${r(x)}`))}
      {LANE_X.map((x, i) => [
        dot(x, ZONE_Y, 'slot', `п${i + 1} центр y${ZONE_Y}`),
        dot(x, ZONE_Y - PILL_H / 2, 'slot', `верх y${r(ZONE_Y - PILL_H / 2)}`),
        dot(x, ZONE_Y + PILL_H / 2, 'slot', `низ y${r(ZONE_Y + PILL_H / 2)}`),
      ])}
      {plan.fillMs.map((ms, k) => [
        dot(LANE_X[k] + 9, ZONE_Y - (SPEED * ms) / 2000, 'hold', `сл.${k + 1} старт y${r(ZONE_Y - (SPEED * ms) / 2000)}`),
        dot(LANE_X[k] + 9, ZONE_Y + (SPEED * ms) / 2000, 'hold', `конец y${r(ZONE_Y + (SPEED * ms) / 2000)}`),
      ])}
      {dot(50, Math.max(ENTER_Y, 0.5), 'anchor', `вход y${ENTER_Y}`)}
      {dot(50, Math.min(EXIT_Y, 99), 'anchor', `выход y${EXIT_Y}`)}
      {plan.fillAt.map((t, k) => dot(2, 20 + k * 6, 'anchor', `слово ${k + 1}: ${t}…${t + plan.fillMs[k]} мс`))}
    </div>
  )
}
