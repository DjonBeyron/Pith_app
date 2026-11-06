// «Пит уворачивается» (режим «Говорю» гонки): чистая логика без DOM — где стоит голова Пита по x и когда она отскакивает от пилюли. Время и пилюли приходят аргументами (шаг на кадр из движка пилюль),
// проверяется тестами (raceDodge.test.js); DOM и журнал — raceDodgeDrive.js.
//  • Слежение: пока едет живая пилюля (state 'fly' — не засчитана, не взлетает), Пит стоит внизу под ЕЁ дорожкой (центр дорожки, но голова целиком в кадре — laneX); живых нет — стоит, где стоял.
//    Из нескольких живых следим за самой нижней, ещё не дошедшей до макушки верхним краем.
//  • Уворот: нижний край пилюли подошёл к макушке ближе чем leadOf(speed) (% высоты: 0,3 с пути пилюли, не меньше 8 и не больше 14) — Пит отскакивает в сторону, где пилюля его не задевает
//    (центр головы дальше от центра пилюли, чем полпилюли + 0,4 головы); у средней дорожки — в сторону, где внизу нет другой пилюли, иначе попеременно. Засчитанная пилюля (lock / won) не живая — уворота нет.
//  • Возврат: увёрнутая пилюля прошла (верхний край ниже экрана), ушла из списка или её засчитали — Пит мягко возвращается под дорожку следующей живой пилюли (или туда, где стоял).
// step(pills, t) → { x, dodge: null | { dir, at, x, id }, need, events }: x — база (центр головы под дорожкой, % ширины), dodge.x — куда отскочил; need — голова должна торчать (пилюля близко или уворот);
// events — 'track' (база сменилась), 'dodge' (отскок: lane, y, speed, dir, x), 'back' (возврат: x).
import { LANE_X, PILL_H, PILL_W, SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'

export const HEAD_TOP = 81        // макушка поднятой головы, % высоты экрана (375×812: голова 50 % ширины ≈ 19,6 % высоты, торчит на 96 %) — привод меряет по DOM
export const HEAD_W = 50          // ширина головы, % ширины экрана (min(50 %, 200px))
export const LEAD_S = 0.3         // уворот — за столько секунд пути пилюли до макушки…
export const LEAD_MIN = 8         // …но не ближе 8 % высоты
export const LEAD_MAX = 14        // и не дальше 14 %
export const NEED_AHEAD = 30      // голова поднимается, когда до макушки остаётся 30 % (пилюля «подходит»): успевает выскочить (пружина 0,55 с) до уворота
export const DODGE_EDGE = 12      // ближе к краю центр головы при увороте не уходит (половина головы может на мгновение выглянуть за край)
const CLEAR_HEAD = 0.4            // доля ширины головы, на которую пилюля не должна заходить (кончики ушей и усов могут задеть)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const leadOf = (speed = 1) => clamp(SPEED * (speed || 1) * LEAD_S, LEAD_MIN, LEAD_MAX)
/** Центр головы под дорожкой: центр дорожки, но голова целиком в кадре (у крайних дорожек — чуть ближе к середине) */
export const laneX = (lane, headW = HEAD_W) => clamp(LANE_X[lane] ?? 50, headW / 2 + 2, 100 - headW / 2 - 2)
const bottomOf = p => p.y + PILL_H / 2
const topOf = p => p.y - PILL_H / 2
const alive = p => p.state === 'fly'

/** Куда отскочить от пилюли p: dir −1 / +1 и x центра головы; у средней дорожки — сторона без другой пилюли внизу, иначе попеременно (prev — прошлое направление) */
export function dodgeOf(p, pills = [], { headW = HEAD_W, headTop = HEAD_TOP, prev = 1 } = {}) {
  const px = LANE_X[p.lane] ?? 50
  const clear = PILL_W / 2 + headW * CLEAR_HEAD
  const fits = dir => { const x = px + dir * clear; return x >= DODGE_EDGE && x <= 100 - DODGE_EDGE }
  const busy = dir => pills.some(q => q !== p && q.lane === p.lane + dir && bottomOf(q) > headTop - NEED_AHEAD && topOf(q) < 100)
  let dirs = [-1, 1].filter(fits)
  if (dirs.length > 1) { const free = dirs.filter(d => !busy(d)); dirs = free.length === 1 ? free : [-prev] }
  const dir = dirs[0] ?? (px < 50 ? 1 : -1)
  return { dir, x: clamp(px + dir * clear, DODGE_EDGE, 100 - DODGE_EDGE) }
}

export function createDodge({ headTop = HEAD_TOP, headW = HEAD_W, x0 = 50 } = {}) {
  let x = x0
  let dodge = null
  let prev = 1
  return {
    step(pills = [], t = 0) {
      const events = []
      if (dodge) {
        const p = pills.find(q => q.id === dodge.id)
        if (!p || topOf(p) >= 100 || p.state === 'lock' || p.state === 'won') { dodge = null; events.push({ type: 'back', t }) }
      }
      const target = pills.filter(p => alive(p) && topOf(p) < headTop).reduce((a, p) => (!a || p.y > a.y ? p : a), null)
      if (!dodge && target) {
        const nx = laneX(target.lane, headW)
        if (nx !== x) { x = nx; events.push({ type: 'track', x, lane: target.lane, t }) }
        if (bottomOf(target) >= headTop - leadOf(target.speed)) {
          const d = dodgeOf(target, pills, { headW, headTop, prev })
          prev = d.dir
          dodge = { ...d, at: t, id: target.id }
          events.push({ type: 'dodge', lane: target.lane, y: target.y, speed: target.speed ?? 1, dir: d.dir, x: d.x, t })
        }
      }
      for (const e of events) if (e.type === 'back') e.x = x
      return { x, dodge, need: !!dodge || (!!target && bottomOf(target) >= headTop - NEED_AHEAD), events }
    },
    /** Сцена кончилась: Пит отскочил — вернуть под базу (вернёт x базы), иначе null */
    stop() { const was = !!dodge; dodge = null; return was ? x : null },
    get x() { return x },
  }
}
