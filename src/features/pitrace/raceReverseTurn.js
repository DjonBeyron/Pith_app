// Разворот в реверс между проходами A и B «Конвейера слов» (владелец 2026-11-17): после A без ошибок дорожки замедляются, по центру на одной высоте приезжают три пилюли со стрелками вниз, плавно разворачиваются на 180°
// (стрелки смотрят вверх) и уезжают вверх — конвейер идёт в обратную сторону, слова выезжают снизу тем же конвейером без шва. Пит в это время говорит реплику (стадия catch-rev, line), слух (голосом) переключается на русский.
// Пилюли — из общего пула, но с data-still: привод конвейера (laneConveyorDrive) не считает их «живыми», узор дорожек сам затихает, пока они едут и стоят, и возвращается, когда data-still снят. Направление узора (data-up на корне игры)
// переключается в середине разворота — стоячий узор под вращающимися пилюлями. Только WAAPI (translate / rotate / opacity), слабое устройство и reduced-motion — те же шаги без вращения.
// Тайминг (REV_MS ≈ 2,9 с): приезд 1,5 с (замедление), пауза 80 мс, поворот 0,48 с, отъезд вверх 0,8 с; кадр — по таймерам, а не по кадрам JS.
import { flightPosition, mirrorY } from './../player/modules/rotate-phone/wordLaneMotion.js'
import { ENTER_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { pLog } from '../../shared/lib/debug.js'

export const REV_ARRIVE_MS = 1500
export const REV_PAUSE_MS = 80
export const REV_TURN_MS = 480
export const REV_LEAVE_MS = 800
export const REV_MS = REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS + REV_LEAVE_MS + 120 // стадия ≥ анимации (+ запас)
export const REV_ARROW = '↓'  // стрелка на пилюле; после поворота на 180° смотрит вверх
const MID_Y = 46              // центр пилюль при остановке, % высоты экрана
const LEAVE_Y = mirrorY(ENTER_Y) // за верхним краем

/** Запуск разворота на пуле: pool — createPool, root — корень игры (.wl), fast — без вращения (слабое устройство / reduced-motion). → отмена (снимает таймеры, возвращает пилюли в пул). */
export function runReverseTurn({ pool, root, fast = false, log = pLog, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const ks = [0, 1, 2].map(lane => pool.take(lane, { flight: false, quiet: true })).filter(k => k != null)
  const els = ks.map(k => pool.el(k))
  const anims = [] // все WAAPI-анимации разворота: перед возвратом пилюли в пул снимаются (иначе fill: both держит её скрытой и повёрнутой)
  const put = a => { anims.push(a); return a }
  const release = () => { for (const a of anims) { try { a.cancel() } catch { /* уже снята */ } } anims.length = 0; ks.forEach(k => { try { pool.give(k) } catch { /* уже в пуле */ } }) }
  ks.forEach((k, i) => {
    pool.cap(k, REV_ARROW); pool.attr(k, 'data-arrow'); pool.attr(k, 'data-still'); pool.attr(k, 'data-quiet')
    const el = els[i]
    put(el.animate([{ translate: flightPosition(ENTER_Y), opacity: 1 }, { translate: flightPosition(MID_Y), opacity: 1 }], { duration: REV_ARRIVE_MS, easing: 'cubic-bezier(0.1, 0.6, 0.3, 1)', fill: 'both' })) // приезд с замедлением до нуля
  })
  log(`[reverse] разворот: ${ks.length} пилюли со стрелками приезжают за ${REV_ARRIVE_MS} мс`)
  const timers = []
  const at = (ms, fn) => timers.push(setTimer(fn, ms))
  at(REV_ARRIVE_MS + REV_PAUSE_MS, () => { // разворот на 180°
    els.forEach(el => put(el.animate([{ rotate: '0deg' }, { rotate: '180deg' }], { duration: fast ? 1 : REV_TURN_MS, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', fill: 'both' })))
    log('[reverse] разворот на 180°')
  })
  at(REV_ARRIVE_MS + REV_PAUSE_MS + Math.round(REV_TURN_MS / 2), () => { root?.setAttribute('data-up', ''); log('[reverse] узор дорожек — вверх') }) // середина поворота: направление узора меняется под вращающимися пилюлями
  at(REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS, () => { // отъезд вверх: конвейер возвращается (data-still снят) уже в обратную сторону
    ks.forEach((k, i) => { pool.attr(k, 'data-still', false); put(els[i].animate([{ translate: flightPosition(MID_Y), opacity: 1 }, { translate: flightPosition(LEAVE_Y), opacity: 1, offset: 0.85 }, { translate: flightPosition(LEAVE_Y), opacity: 0 }], { duration: REV_LEAVE_MS, easing: 'cubic-bezier(0.5, 0, 0.9, 0.45)', fill: 'both' })) })
    log('[reverse] пилюли уезжают вверх, конвейер идёт в обратную сторону')
  })
  at(REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS + REV_LEAVE_MS + 40, release)
  return () => { timers.forEach(clearTimer); release() }
}
