// «Танец» Пита на трёх нотах отсчёта этапа (владелец, v3.3.282): «Пит двигается по оси x ВЕСЬ в такт нотам с плавной интерполяцией, как мини-танец с закрытыми глазами: если он по центру — сперва вправо до края экрана,
// потом влево до края, потом опять вправо до края — это и есть три ноты; потом плавно открывает глаза перед первым словом этапа. Если он в коробке — не нужно».
// Пит на сцене всегда «в слежении» (raceHeadDepth.js ведёт --wl-dx / --wl-dy), поэтому танец идёт отдельным свойством translate на корне .wlCat (WAAPI, ease-in-out): нырок и глубину он не трогает, по окончании
// голова возвращается на своё место (x до танца) и возвращается прежнее лицо. Три размаха: нота k (k = 0, 1, 2) начинает размах к краю: вправо, влево, вправо (длина размаха = шаг нот, SOFT_STEP_MS 600 мс); дальше HOME_MS
// плавно к своему месту, на этом отрезке глаза открываются (лицо возвращается за EYES_BEFORE_MS до конца). Чистые функции + запуск на DOM; в тестах DOM подставляется.
export const DANCE_STEP_MS = 600      // размах = шаг между нотами (rehearsalCountdown.SOFT_STEP_MS)
export const DANCE_HOME_MS = 700      // возврат на место после третьей ноты
export const EYES_BEFORE_MS = 350     // глаза открываются за столько до конца танца
export const DANCE_FACE = 'love'      // закрытые глаза
export const EDGE_PAD_PCT = 1         // голова не упирается в самый край: центр на headW/2 + 1 % от границы

/** Центры по x (% ширины сцены): [вправо, влево, вправо] и место, откуда начали */
export const edgeXs = (headW = 50) => [100 - headW / 2 - EDGE_PAD_PCT, headW / 2 + EDGE_PAD_PCT, 100 - headW / 2 - EDGE_PAD_PCT]

/** Кадры translate (px) относительно места x0 (%): размах вправо / влево / вправо по шагу нот, потом возврат; stageW — ширина сцены px. → { frames, duration } */
export function danceFrames({ x0 = 50, headW = 50, stageW = 375, step = DANCE_STEP_MS, home = DANCE_HOME_MS } = {}) {
  const px = x => `${(((x - x0) / 100) * stageW).toFixed(1)}px 0`
  const xs = edgeXs(headW), duration = step * 3 + home
  const key = (t, x) => ({ translate: px(x), offset: t / duration, easing: 'ease-in-out' })
  return { frames: [key(0, x0), key(step, xs[0]), key(step * 2, xs[1]), key(step * 3, xs[2]), { translate: px(x0), offset: 1 }], duration }
}

/** Танцевать ли: не в коробке (Мия на Пите) и не у слабого устройства / reduced-motion */
export const canDance = ({ boxed = false, lite = false, still = false } = {}) => !boxed && !lite && !still

/**
 * Запустить танец на корне игры game (.wl). → stop() (снять анимацию, вернуть лицо) или null (нет Пита / нельзя / в коробке).
 * Лицо: закрытые глаза (love) на время размахов, прежнее — за EYES_BEFORE_MS до конца. Журнал: «[dance] …».
 */
export function startNoteDance({ game, lite = false, still = false, step = DANCE_STEP_MS, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const cat = game?.querySelector?.('[data-testid="wl-cat"]')
  const boxed = !!game?.querySelector?.('.wlMia[data-live]')
  if (!cat?.animate || !canDance({ boxed, lite, still })) { try { log(`[dance] танца нет: ${!cat ? 'нет Пита' : boxed ? 'Пит в коробке' : 'слабое устройство / reduced-motion'}`) } catch { /* журнал */ } return null }
  const stage = cat.parentElement, stageW = stage?.offsetWidth || 375, headW = cat.offsetWidth && stageW ? (cat.offsetWidth / stageW) * 100 : 50
  const x0 = Number(cat.dataset.dodgeX) || Number(cat.style.getPropertyValue('--cat-x')) || 50
  const { frames, duration } = danceFrames({ x0, headW, stageW, step })
  const face = cat.getAttribute('data-face') || 'base'
  cat.setAttribute('data-face', DANCE_FACE)
  const anim = cat.animate(frames, { duration, fill: 'none' })
  const restore = () => { if (cat.getAttribute('data-face') === DANCE_FACE) cat.setAttribute('data-face', face) }
  const timer = setTimer(restore, Math.max(0, duration - EYES_BEFORE_MS))
  try { log(`[dance] танец на трёх нотах: x ${x0.toFixed(0)} % → край → край → край → назад, ${Math.round(duration)} мс, глаза закрыты до ${Math.round(duration - EYES_BEFORE_MS)} мс`) } catch { /* журнал */ }
  return () => { clearTimer(timer); try { anim.cancel() } catch { /* уже снята */ } restore() }
}
