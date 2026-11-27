// Разворот в реверс между проходами A и B «Конвейера слов» (владелец 2026-11-17) и назад — на церемонии Мии после B. Три пилюли с тройной стрелкой (race-reverse.css) едут СТРОГО по направлению конвейера, плавно тормозят (ease-out, постоянное
// замедление) и встают по центру; конвейер тормозит вместе с ними (привод laneConveyorDrive: пилюлям ставится data-still за DECEL_MS до остановки — пунктир гаснет ровно к моменту, когда они встали) и СТОИТ, пока пилюли в центре. Потом пилюли
// разворачиваются на 180° (в середине поворота узор дорожек меняет направление — data-up на корне игры), и уезжают в противоположную сторону с ускорением (ease-in), а конвейер запускается так же — как запуск после остановки (событие
// WARM_EVENT: привод разгоняет дорожки сразу, без «зажигания»; ускорение ACCEL_MS, пунктир уже бежит в обратную сторону). Вперёд (A → B): приезд сверху, отъезд вверх; назад (после B): приезд снизу, отъезд вниз. Пилюли — из общего пула; только WAAPI
// (translate / rotate / opacity); слабое устройство и reduced-motion — то же без вращения. Тайминг (REV_MS ≈ 3,6 с): приезд 1,6 с, стоянка 0,2 с, поворот 0,4 с, отъезд 1,3 с.
import { revTimes, convSpeed, REV_PAUSE_MS, REV_TURN_MS, REV_RAMP_PCT, REV_MID_Y } from './raceReverseTimes.js'
import { flightPosition, mirrorY } from './../player/modules/rotate-phone/wordLaneMotion.js'
import { ENTER_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { DECEL_MS } from '../player/modules/rotate-phone/wordLaneConveyor.js'
import { pLog } from '../../shared/lib/debug.js'
import { READY_MS } from './raceSwitch.js'

export { REV_PAUSE_MS, REV_TURN_MS }
export const REV_ARRIVE_MS = revTimes(1).arrive // при скорости конвейера ×1 (реальное время — revTimes(convSpeed.v), raceReverseTimes.js)
export const REV_LEAVE_MS = revTimes(1).leave
export const REV_MS = revTimes(1).total // стадия ≥ анимации (+ запас); директор берёт время по текущей скорости
export const REV_BACK_LEAD_MS = revTimes(1).lead // разворот назад стартует за столько мс до конца диалогов Мии: к последнему слову она пилюли развернулись, дальше — только отъезд
export const REV_START_SLACK_MS = 150 // запас стадии разворота: пилюли могут чуть подождать доезжающие пилюли прошлой ступени
export const REV_WAIT_CAP_MS = 600 // стадия разворота ждёт занятость Пита не дольше: его же реплика про реверс идёт ВМЕСТЕ с анимацией (раньше hold = реплика + анимация, после неё была тишина ≈ 4 с, владелец v3.3.272)
export const TURN_EVENT = 'wl-conveyor-turn' // событие на корне игры с detail 'halt' | 'warm' | 'resume' (laneConveyorDrive): конвейер тормозит и стоит / стартует разгоном без «зажигания» / снять стоп
const turn = (root, detail) => root?.dispatchEvent?.(new globalThis.CustomEvent(TURN_EVENT, { detail }))
export const REV_ARROW = '›'  // заглушка подписи пилюли (data-cap): сама стрелка — маска ::after (race-reverse.css)
export const REV_WAIT_POLL_MS = 100 // пока слух переключается, пилюли стоят в центре и ждут: так часто смотрим, готова ли модель
export const REV_HOLD_CAP_MS = READY_MS + 4000 // ждать модель не дольше (как useSwitchWait: у переключателя свой срок READY_MS, дальше он сам вернёт английскую)
export const revBack = { busy: false } // разворот назад идёт / ждёт конца диалогов: три ноты церемонии Мии ждут его конца (useRaceActs.countWait)
const MID_Y = REV_MID_Y
const EASE_OUT = 'cubic-bezier(0.333, 0.667, 0.667, 1)' // постоянное замедление до нуля (y = 1 − (1 − t)²: начальная скорость = скорость конвейера)
const EASE_IN = 'cubic-bezier(0.333, 0, 0.667, 0.333)'  // постоянное ускорение с нуля (y = t²)

/** Запуск разворота на пуле: pool — createPool, root — корень игры (.wl), fast — без вращения (слабое устройство / reduced-motion), back — назад (после B). → отмена (снимает таймеры, возвращает пилюли в пул). */
export function runReverseTurn({ pool, root, fast = false, back = false, hold = null, speed = convSpeed.v, log = pLog, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const T = revTimes(speed), REV_ARRIVE_MS = T.arrive, REV_LEAVE_MS = T.leave // приезд и отъезд — по скорости конвейера
  const dir = Math.sign(MID_Y - (back ? mirrorY(ENTER_Y) : ENTER_Y)), brake = MID_Y - dir * REV_RAMP_PCT // brake — где начинается торможение приезда и где кончается разгон отъезда (зеркально)
  const startY = back ? mirrorY(ENTER_Y) : ENTER_Y, endY = startY // экранные высоты, % экрана: приезд и отъезд — через один и тот же край
  const game = root?.closest?.('.wl') ?? root // data-up стоит на корне игры .wl (CSS узора: .wl[data-up]); root пула — его потомок (поле сцены)
  const ks = [0, 1, 2].map(lane => pool.take(lane, { flight: false, quiet: true })).filter(k => k != null)
  const els = ks.map(k => pool.el(k))
  const anims = [] // все WAAPI-анимации разворота: перед возвратом пилюли в пул снимаются (иначе fill: both держит её скрытой и повёрнутой)
  const put = a => { anims.push(a); return a }
  const release = () => { revBack.busy = false; turn(root, 'resume'); for (const a of anims) { try { a.cancel() } catch { /* уже снята */ } } anims.length = 0; ks.forEach(k => { try { pool.give(k) } catch { /* уже в пуле */ } }) }
  ks.forEach((k, i) => {
    pool.cap(k, REV_ARROW); pool.attr(k, 'data-arrow', back ? 'up' : 'down'); pool.attr(k, 'data-quiet')
    put(els[i].animate([{ translate: flightPosition(startY), opacity: 1, easing: 'linear', offset: 0 }, { translate: flightPosition(brake), opacity: 1, easing: EASE_OUT, offset: T.linear / REV_ARRIVE_MS }, { translate: flightPosition(MID_Y), opacity: 1, offset: 1 }], { duration: REV_ARRIVE_MS, fill: 'both' })) // приезд на скорости конвейера, у центра — постоянное замедление до нуля
  })
  log(`[reverse] разворот${back ? ' назад' : ''}: ${ks.length} пилюли со стрелками приезжают за ${REV_ARRIVE_MS} мс`)
  const timers = []
  const at = (ms, fn) => timers.push(setTimer(fn, ms))
  at(REV_ARRIVE_MS - DECEL_MS, () => { turn(root, 'halt'); log('[reverse] конвейер тормозит вместе с пилюлями') }) // пунктир гаснет ровно к остановке пилюль и стоит, пока пилюли в центре
  const phase2 = base => { // base — через сколько мс от сейчас пилюли начинают разворот (обычно сразу после стоянки; ждали модель — от момента готовности)
  at(base, () => { // пилюли стоят, конвейер стоит: разворот на 180°
    els.forEach(el => put(el.animate([{ rotate: '0deg' }, { rotate: '180deg' }], { duration: fast ? 1 : REV_TURN_MS, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', fill: 'both' })))
    ks.forEach(k => pool.attr(k, 'data-turn')) // стрелки вспыхивают на остановке и повороте (race-reverse.css)
    log('[reverse] разворот на 180°')
  })
  at(base + Math.round(REV_TURN_MS / 2), () => { if (back) game?.removeAttribute('data-up'); else game?.setAttribute('data-up', ''); log(`[reverse] узор дорожек — ${back ? 'вниз' : 'вверх'}`) }) // середина поворота: направление узора меняется, пока конвейер стоит
  at(base + REV_TURN_MS, () => { // отъезд с ускорением; конвейер стартует так же (WARM_EVENT → разгон без зажигания)
    revBack.busy = false // три ноты церемонии идут уже на отъезде пилюль (раньше ждали его конца: после диалогов Мии было молчание)
    ks.forEach((k, i) => { put(els[i].animate([{ translate: flightPosition(MID_Y), opacity: 1, easing: EASE_IN, offset: 0 }, { translate: flightPosition(brake), opacity: 1, easing: 'linear', offset: T.ramp / REV_LEAVE_MS }, { translate: flightPosition(endY), opacity: 0, offset: 1 }], { duration: REV_LEAVE_MS, fill: 'both' })) }) // отъезд: постоянное ускорение с нуля до скорости конвейера, дальше равномерно за край
    turn(root, 'warm')
    log(`[reverse] пилюли уезжают ${back ? 'вниз' : 'вверх'} с ускорением, конвейер стартует в обратную сторону`)
  })
  at(base + REV_TURN_MS + REV_LEAVE_MS + 40, release)
  }
  // слух переключается дольше, чем приезд (Android ≈ 9 с): пилюли стоят в центре и пульсируют (data-wait), пока модель не готова (по событию, не по таймеру), но не дольше REV_HOLD_CAP_MS; готова к повороту — идём без остановки, как раньше
  if (!hold) phase2(REV_ARRIVE_MS + REV_PAUSE_MS)
  else at(REV_ARRIVE_MS + REV_PAUSE_MS, () => {
    if (!hold()) { phase2(0); return }
    const w0 = performance.now(); ks.forEach(k => pool.attr(k, 'data-wait')); log('[reverse] слух ещё переключается — пилюли ждут в центре')
    const poll = () => { if (hold() && performance.now() - w0 < REV_HOLD_CAP_MS) { at(REV_WAIT_POLL_MS, poll); return } ks.forEach(k => pool.attr(k, 'data-wait', false)); log(`[reverse] слух готов — ждали ${Math.round(performance.now() - w0)} мс, разворачиваемся`); phase2(0) }
    at(REV_WAIT_POLL_MS, poll)
  })
  return () => { timers.forEach(clearTimer); release() }
}
