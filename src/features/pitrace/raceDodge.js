// «Пит ныряет и уворачивается» (режим «Говорю» гонки): чистая логика без DOM — где стоит голова Пита по x и КАК она переходит с дорожки на дорожку. Время, пилюли и события ступени приходят аргументами
// (шаг на кадр из движка пилюль), проверяется тестами (raceDodge.test.js); DOM, таймеры и журнал — raceDodgeDrive.js.
//  • Целевая дорожка — всегда дорожка СЛЕДУЮЩЕЙ пилюли (lanes[i + 1]; ступень знает дорожки всех повторов заранее, step.reps[i].lane); для начала ступени — дорожка первой. Пилюль больше нет — центр (50 %, как до гонки).
//  • По x голова НИКОГДА не скользит. Два перехода: НЫРОК ('dive': голова уходит вниз за край, x переставляется, пока скрыта, выныривает с пружиной) и ПРЫЖОК ('jump': рывок с наклоном и сжатием, без возврата).
//    start → нырок под дорожку первой пилюли. После зачёта / «не успел» Пит ныряет ТОЛЬКО если ему реально нужно сменить дорожку (v3.3.152): следующая на той же дорожке, следующей нет (последняя
//    пилюля прохода) или он уже под следующей — стоит на месте (kind null, suppressed: «нырок подавлен»); в центр его переставляет конец ступени (end — на плашке этапа). Зачёт, когда пилюля уже подходит
//    к голове (низ ближе NEED_AHEAD к макушке), а дорожка другая, — прыжок к следующей (голова на виду, нырок выглядел бы «без причины»), раньше — нырок.
//    Пилюля i дошла до Пита (низ подошёл к макушке ближе leadOf(speed): 0,3 с её пути, 8–14 % высоты) — прыжок на дорожку пилюли i + 1. Не проходит мимо пилюли (голова задела бы её) — прыжок дальше в ту же сторону,
//    насколько нужно (не ближе DODGE_EDGE к краю). Следующая на ТОЙ ЖЕ дорожке (или следующей нет) — прыжок в сторону, а когда пилюля прошла (верх ниже края, с учётом времени прыжка), её засчитали
//    или она ушла — прыжок обратно на дорожку (нет следующей — стоит в стороне до конца ступени). fail(i) после прыжка ничего не делает; без прыжка (пилюля не дошла до головы) — нырок к следующей, если она на другой дорожке.
//    Зачёт после начала прыжка (ответ в последний момент): Пит уже под следующей — переход не нужен (kind null).
// План перехода: { kind: 'dive' | 'jump' | null, from, toLane, x, waitMs, why, dir?, pill?, suppressed?, claim? } — from / toLane: номер дорожки, 'c' (центр) или 's' (в стороне); waitMs — через сколько Пит встанет на место
// (речь ждёт); claim — у зачёта: { i, at (где голова), next (дорожка следующей), jumped (прыжок уже начат), late (пилюля у головы) } для строки журнала «[dodge] зачёт …» (raceDodgeDrive.claimLine).
import { LANE_X, PILL_H, PILL_W, SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'

export const HEAD_TOP = 81        // макушка поднятой головы, % высоты экрана (375×812: голова 50 % ширины ≈ 19,6 % высоты, торчит на 96 %) — привод меряет по DOM
export const HEAD_W = 50          // ширина головы, % ширины экрана (min(50 %, 200px))
export const LEAD_S = 0.3         // прыжок — за столько секунд пути пилюли до макушки…
export const LEAD_MIN = 8         // …но не ближе 8 % высоты
export const LEAD_MAX = 14        // и не дальше 14 %
export const NEED_AHEAD = 30      // голова поднимается, когда до макушки остаётся 30 % (пилюля «подходит»)
export const DODGE_EDGE = 12      // ближе к краю центр головы при прыжке не уходит (половина головы может на мгновение выглянуть за край)
export const DIVE_DOWN_MS = 200   // нырок: голова уходит за нижний край (CSS 0,17 с + запас на занятый кадр), потом x переставляется
export const DIVE_UP_MS = 220     // и выныривает (с лёгким перелётом)
export const DIVE_MS = DIVE_DOWN_MS + DIVE_UP_MS
export const JUMP_MS = 180        // прыжок-уворот (пружина; наклон и сжатие доигрывают keyframes)
export const CENTER = 'c'
export const ASIDE = 's'
const CLEAR_HEAD = 0.4            // доля ширины головы, на которую пилюля не должна заходить (кончики ушей и усов могут задеть)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const leadOf = (speed = 1) => clamp(SPEED * (speed || 1) * LEAD_S, LEAD_MIN, LEAD_MAX)
/** Центр головы под дорожкой: центр дорожки, но голова целиком в кадре (у крайних дорожек — чуть ближе к середине) */
export const laneX = (lane, headW = HEAD_W) => clamp(LANE_X[lane] ?? 50, headW / 2 + 2, 100 - headW / 2 - 2)
const bottomOf = p => p.y + PILL_H / 2
const topOf = p => p.y - PILL_H / 2
const alive = p => p.state === 'fly'
const clearOf = headW => PILL_W / 2 + headW * CLEAR_HEAD

/** Куда отскочить от пилюли p в сторону: dir −1 / +1 и x центра головы; у средней дорожки — сторона без другой пилюли внизу, иначе попеременно (prev — прошлое направление) */
export function dodgeOf(p, pills = [], { headW = HEAD_W, headTop = HEAD_TOP, prev = 1 } = {}) {
  const px = LANE_X[p.lane] ?? 50
  const clear = clearOf(headW)
  const fits = dir => { const x = px + dir * clear; return x >= DODGE_EDGE && x <= 100 - DODGE_EDGE }
  const busy = dir => pills.some(q => q !== p && q.lane === p.lane + dir && bottomOf(q) > headTop - NEED_AHEAD && topOf(q) < 100)
  let dirs = [-1, 1].filter(fits)
  if (dirs.length > 1) { const free = dirs.filter(d => !busy(d)); dirs = free.length === 1 ? free : [-prev] }
  const dir = dirs[0] ?? (px < 50 ? 1 : -1)
  return { dir, x: clamp(px + dir * clear, DODGE_EDGE, 100 - DODGE_EDGE) }
}

/** Прыжок от пилюли p на дорожку lane: x под дорожкой, а если там голова задела бы пилюлю — дальше в ту же сторону, насколько нужно */
export function jumpTo(p, lane, headW = HEAD_W) {
  const px = LANE_X[p.lane] ?? 50, x = laneX(lane, headW), dir = x > px ? 1 : -1
  const clear = clearOf(headW)
  return { dir, x: Math.abs(x - px) >= clear ? x : clamp(px + dir * clear, DODGE_EDGE, 100 - DODGE_EDGE) }
}

export function createDodge({ lanes = [], headTop = HEAD_TOP, headW = HEAD_W, x0 = 50, from = 0 } = {}) { // from — «Продолжить» после паузы: первая пилюля ступени — повтор from
  let x = x0
  let at = Math.abs(x0 - 50) < 0.5 ? CENTER : null // где стоит: дорожка, центр, в стороне (null — неизвестно: прошлая ступень)
  let placedFor = -1   // под чью пилюлю Пит уже встал (номер повтора)
  let aside = null     // прыжок в сторону, ждём прохода пилюли: { id, back: plan }
  let prev = 1
  const target = i => (i < lanes.length && lanes[i] != null ? lanes[i] : CENTER)
  const xOf = l => (l === CENTER ? 50 : laneX(l, headW))
  const plan = (kind, toLane, nx, why, o = {}) => {
    const p = { kind, from: at, toLane, x: nx, waitMs: kind === 'dive' ? DIVE_MS : kind === 'jump' ? JUMP_MS : 0, why, ...o }
    x = nx; at = toLane
    return p
  }
  const dive = (i, why) => { placedFor = Math.max(placedFor, i); aside = null; const l = target(i); return plan('dive', l, xOf(l), why) }
  const none = (why, o = {}) => ({ kind: null, from: at, toLane: at, x, waitMs: 0, why, ...o })
  const stand = why => none(why, { suppressed: true })
  const late = p => !!p && bottomOf(p) >= headTop - NEED_AHEAD && topOf(p) < 100 // пилюля уже подходит к голове (зачёт «в последний момент»)
  /** Переход к пилюле i после зачёта / «не успел» без прыжка: только если нужно сменить дорожку; late — пилюля у головы, сменить дорожку прыжком */
  const toNext = (i, why, p = null) => {
    const l = target(i)
    if (l === CENTER) { placedFor = Math.max(placedFor, i); aside = null; return stand(`${why}; стоим: следующей нет, в центр — в конце ступени`) }
    if (l === at) { placedFor = Math.max(placedFor, i); aside = null; return stand(`${why}; стоим: уже на дорожке следующей`) }
    if (!late(p)) return dive(i, why)
    placedFor = Math.max(placedFor, i); aside = null
    const nx = xOf(l)
    return plan('jump', l, nx, `${why} в последний момент`, { dir: nx > x ? 1 : -1 })
  }
  const jumpPast = (p, why) => {
    const i = p.rep, l = target(i + 1)
    placedFor = i + 1
    if (l !== CENTER && l !== p.lane) return plan('jump', l, jumpTo(p, l, headW).x, why, { dir: jumpTo(p, l, headW).dir, pill: p })
    const d = dodgeOf(p, [], { headW, headTop, prev }); prev = d.dir
    const back = l === CENTER ? null : { kind: 'jump', toLane: l, x: xOf(l) } // следующей нет — обратно не прыгает: стоит в стороне до конца ступени (end — нырок в центр на плашке)
    aside = { id: p.id, speed: p.speed ?? 1, back }
    return plan('jump', ASIDE, d.x, why, { dir: d.dir, pill: p, same: l !== CENTER })
  }
  const goBack = why => { const b = aside.back; aside = null; return b ? plan(b.kind, b.toLane, b.x, why, { dir: b.x > x ? 1 : -1 }) : stand(`${why}; стоим: следующей нет, в центр — в конце ступени`) }
  const passed = (p, speed) => topOf(p) >= 100 - (SPEED * speed * JUMP_MS) / 1000 // к концу прыжка обратно верх пилюли уже ниже края

  return {
    /** Начало ступени: под дорожку первой пилюли */
    start: () => dive(from, from ? 'продолжаем' : 'старт'),
    /** Слово повтора i засчитано (pills — пилюли на экране: пилюля i у головы — зачёт «в последний момент»). Пит уже под следующей (прыгнул до зачёта) — стоит; прыгнул в сторону — прыжок обратно на дорожку
     *  следующей (нет её — стоит); иначе к следующей — только если она на другой дорожке: нырок, а когда пилюля уже у головы — прыжок */
    claim(i, pills = []) {
      const p = pills.find(q => q.rep === i) ?? null
      const info = { i, at, next: target(i + 1), jumped: placedFor > i, late: late(p) }
      const r = placedFor > i ? (aside ? goBack('зачёт') : stand('зачёт после начала прыжка; стоим: уже под следующей')) : toNext(i + 1, 'зачёт', p)
      return { ...r, claim: info }
    },
    /** «Не успел» повтора i: прыжок уже был — ничего (возврат из стороны ведёт step), иначе к следующей, если она на другой дорожке */
    fail(i) { return placedFor > i ? none('уже под следующей') : toNext(i + 1, 'не успел') },
    /** Ступень кончилась: стоял в стороне или не в центре — нырок в центр */
    end() { aside = null; return at === CENTER ? none('уже в центре') : plan('dive', CENTER, 50, 'конец ступени') },
    /** Кадр: прыжок, когда живая пилюля дошла до макушки; возврат из стороны, когда она прошла. → { plans, need } */
    step(pills = []) {
      const plans = []
      if (aside) {
        const p = pills.find(q => q.id === aside.id)
        if (!p || p.state === 'lock' || p.state === 'won' || passed(p, aside.speed)) plans.push(goBack(p && (p.state === 'lock' || p.state === 'won') ? 'зачёт' : 'пилюля прошла'))
      }
      const near = pills.filter(p => alive(p) && topOf(p) < headTop && p.rep > placedFor - 1).reduce((a, p) => (!a || p.y > a.y ? p : a), null)
      if (!aside && near && bottomOf(near) >= headTop - leadOf(near.speed)) plans.push(jumpPast(near, 'не успел'))
      const coming = pills.some(p => alive(p) && topOf(p) < headTop && bottomOf(p) >= headTop - NEED_AHEAD)
      return { plans, need: !!aside || coming }
    },
    /** Сколько мс ещё до возврата из стороны (пилюля пройдёт + переход), 0 — не в стороне */
    backIn(pills = []) {
      if (!aside) return 0
      const p = pills.find(q => q.id === aside.id)
      const ms = p ? Math.max(0, ((100 - (SPEED * aside.speed * JUMP_MS) / 1000 - topOf(p)) / (SPEED * aside.speed)) * 1000) : 0
      return aside.back ? ms + JUMP_MS : 0 // следующей нет — стоит в стороне, речь не ждёт
    },
    get x() { return x },
    get at() { return at },
  }
}
