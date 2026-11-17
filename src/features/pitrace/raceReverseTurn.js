// Разворот в реверс между проходами A и B «Конвейера слов» (владелец 2026-11-17) и назад — на церемонии Мии после B. Три пилюли с тройной стрелкой (race-reverse.css) едут СТРОГО по направлению конвейера, плавно тормозят (ease-out, постоянное
// замедление) и встают по центру; конвейер тормозит вместе с ними (привод laneConveyorDrive: пилюлям ставится data-still за DECEL_MS до остановки — пунктир гаснет ровно к моменту, когда они встали) и СТОИТ, пока пилюли в центре. Потом пилюли
// разворачиваются на 180° (в середине поворота узор дорожек меняет направление — data-up на корне игры), и уезжают в противоположную сторону с ускорением (ease-in), а конвейер запускается так же — как запуск после остановки (событие
// WARM_EVENT: привод разгоняет дорожки сразу, без «зажигания»; ускорение ACCEL_MS, пунктир уже бежит в обратную сторону). Вперёд (A → B): приезд сверху, отъезд вверх; назад (после B): приезд снизу, отъезд вниз. Пилюли — из общего пула; только WAAPI
// (translate / rotate / opacity); слабое устройство и reduced-motion — то же без вращения. Тайминг (REV_MS ≈ 3,6 с): приезд 1,6 с, стоянка 0,2 с, поворот 0,4 с, отъезд 1,3 с.
import { flightPosition, mirrorY } from './../player/modules/rotate-phone/wordLaneMotion.js'
import { ENTER_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { DECEL_MS } from '../player/modules/rotate-phone/wordLaneConveyor.js'
import { pLog } from '../../shared/lib/debug.js'

export const REV_ARRIVE_MS = 1600
export const REV_PAUSE_MS = 200
export const REV_TURN_MS = 400
export const REV_LEAVE_MS = 1300
export const REV_MS = REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS + REV_LEAVE_MS + 120 // стадия ≥ анимации (+ запас)
export const TURN_EVENT = 'wl-conveyor-turn' // событие на корне игры с detail 'halt' | 'warm' | 'resume' (laneConveyorDrive): конвейер тормозит и стоит / стартует разгоном без «зажигания» / снять стоп
const turn = (root, detail) => root?.dispatchEvent?.(new globalThis.CustomEvent(TURN_EVENT, { detail }))
export const REV_ARROW = '›'  // заглушка подписи пилюли (data-cap): сама стрелка — маска ::after (race-reverse.css)
export const revBack = { busy: false } // разворот назад идёт / ждёт конца диалогов: три ноты церемонии Мии ждут его конца (useRaceActs.countWait)
const MID_Y = 50              // центр пилюль при остановке, % высоты экрана
const EASE_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // замедление до нуля (постоянное, как торможение конвейера)
const EASE_IN = 'cubic-bezier(0.55, 0.085, 0.68, 0.53)'  // ускорение с нуля

/** Запуск разворота на пуле: pool — createPool, root — корень игры (.wl), fast — без вращения (слабое устройство / reduced-motion), back — назад (после B). → отмена (снимает таймеры, возвращает пилюли в пул). */
export function runReverseTurn({ pool, root, fast = false, back = false, log = pLog, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const startY = back ? mirrorY(ENTER_Y) : ENTER_Y, endY = startY // экранные высоты, % экрана: приезд и отъезд — через один и тот же край
  const game = root?.closest?.('.wl') ?? root // data-up стоит на корне игры .wl (CSS узора: .wl[data-up]); root пула — его потомок (поле сцены)
  const ks = [0, 1, 2].map(lane => pool.take(lane, { flight: false, quiet: true })).filter(k => k != null)
  const els = ks.map(k => pool.el(k))
  const anims = [] // все WAAPI-анимации разворота: перед возвратом пилюли в пул снимаются (иначе fill: both держит её скрытой и повёрнутой)
  const put = a => { anims.push(a); return a }
  const release = () => { revBack.busy = false; turn(root, 'resume'); for (const a of anims) { try { a.cancel() } catch { /* уже снята */ } } anims.length = 0; ks.forEach(k => { try { pool.give(k) } catch { /* уже в пуле */ } }) }
  ks.forEach((k, i) => {
    pool.cap(k, REV_ARROW); pool.attr(k, 'data-arrow', back ? 'up' : 'down'); pool.attr(k, 'data-quiet')
    put(els[i].animate([{ translate: flightPosition(startY), opacity: 1 }, { translate: flightPosition(MID_Y), opacity: 1 }], { duration: REV_ARRIVE_MS, easing: EASE_OUT, fill: 'both' })) // приезд с замедлением до нуля
  })
  log(`[reverse] разворот${back ? ' назад' : ''}: ${ks.length} пилюли со стрелками приезжают за ${REV_ARRIVE_MS} мс`)
  const timers = []
  const at = (ms, fn) => timers.push(setTimer(fn, ms))
  at(REV_ARRIVE_MS - DECEL_MS, () => { turn(root, 'halt'); log('[reverse] конвейер тормозит вместе с пилюлями') }) // пунктир гаснет ровно к остановке пилюль и стоит, пока пилюли в центре
  at(REV_ARRIVE_MS + REV_PAUSE_MS, () => { // пилюли стоят, конвейер стоит: разворот на 180°
    els.forEach(el => put(el.animate([{ rotate: '0deg' }, { rotate: '180deg' }], { duration: fast ? 1 : REV_TURN_MS, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', fill: 'both' })))
    log('[reverse] разворот на 180°')
  })
  at(REV_ARRIVE_MS + REV_PAUSE_MS + Math.round(REV_TURN_MS / 2), () => { if (back) game?.removeAttribute('data-up'); else game?.setAttribute('data-up', ''); log(`[reverse] узор дорожек — ${back ? 'вниз' : 'вверх'}`) }) // середина поворота: направление узора меняется, пока конвейер стоит
  at(REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS, () => { // отъезд с ускорением; конвейер стартует так же (WARM_EVENT → разгон без зажигания)
    ks.forEach((k, i) => { put(els[i].animate([{ translate: flightPosition(MID_Y), opacity: 1 }, { translate: flightPosition(endY), opacity: 1, offset: 0.85 }, { translate: flightPosition(endY), opacity: 0 }], { duration: REV_LEAVE_MS, easing: EASE_IN, fill: 'both' })) })
    turn(root, 'warm')
    log(`[reverse] пилюли уезжают ${back ? 'вниз' : 'вверх'} с ускорением, конвейер стартует в обратную сторону`)
  })
  at(REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS + REV_LEAVE_MS + 40, release)
  return () => { timers.forEach(clearTimer); release() }
}
