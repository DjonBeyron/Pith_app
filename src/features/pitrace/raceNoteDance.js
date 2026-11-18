// «Танец» Пита на трёх нотах отсчёта этапа (владелец, v3.3.282–283): весь Пит двигается по оси x в такт нотам, плавно (интерполяция) и с небольшими остановками в углах, задействуя ВСЮ ширину экрана: если стоит
// в центре — сперва вправо в угол, потом влево в угол, потом снова вправо в угол, а потом встаёт туда, где нужно для игры. Мимика — ТОЛЬКО закрытые глаза (больше никаких изменений лица): глаза прикрываются на время
// танца и плавно открываются перед первым словом этапа. Если Пит в коробке — не нужно.
// Пит на сцене всегда «в слежении» (raceHeadDepth.js ведёт --wl-dx / --wl-dy), поэтому танец идёт отдельным свойством translate на корне .wlCat (WAAPI) — нырок и глубину не трогает; глаза — свойством scale (по Y) группы
// глаз (data-part="eyes") с центром в её середине. Нота k начинает размах: MOVE_SHARE шага — движение (ease-in-out), остальное — остановка в углу. Чистые функции + запуск на DOM; в тестах DOM подставляется.
export const DANCE_STEP_MS = 600      // размах = шаг между нотами (rehearsalCountdown.SOFT_STEP_MS)
export const MOVE_SHARE = 0.7         // доля шага — движение, остальное — остановка в углу
export const DANCE_HOME_MS = 700      // возврат на место после третьей ноты
export const EYES_OPEN_MS = 350       // глаза плавно открываются за столько до конца танца
export const EYES_CLOSE_MS = 120      // и так же быстро прикрываются в начале
export const EYES_SHUT = 0.06         // scaleY закрытых глаз (щёлочка)

/** Центры по x (% ширины сцены): [вправо, влево, вправо]; голова упирается краем в край экрана (углы) */
export const edgeXs = (headW = 50) => [100 - headW / 2, headW / 2, 100 - headW / 2]

/** Кадры translate (px) относительно места x0 (%): размах вправо / влево / вправо с остановками в углах, потом возврат; stageW — ширина сцены px. → { frames, duration } */
export function danceFrames({ x0 = 50, headW = 50, stageW = 375, step = DANCE_STEP_MS, home = DANCE_HOME_MS } = {}) {
  const px = x => `${(((x - x0) / 100) * stageW).toFixed(1)}px 0`
  const xs = edgeXs(headW), duration = step * 3 + home
  const key = (t, x, easing = 'ease-in-out') => ({ translate: px(x), offset: t / duration, easing })
  const frames = [key(0, x0)]
  xs.forEach((x, k) => { frames.push(key(step * k + step * MOVE_SHARE, x, 'linear'), key(step * (k + 1), x)) }) // дошёл (ease-in-out) → постоял в углу до следующей ноты
  frames.push({ translate: px(x0), offset: 1 })
  return { frames, duration }
}

/** Кадры закрытых глаз: быстро прикрылись, держатся, плавно открылись за EYES_OPEN_MS до конца → { frames, duration } */
export function eyeFrames(duration = DANCE_STEP_MS * 3 + DANCE_HOME_MS) {
  const o = ms => Math.min(1, Math.max(0, ms / duration))
  return { frames: [{ scale: '1 1', offset: 0 }, { scale: `1 ${EYES_SHUT}`, offset: o(EYES_CLOSE_MS), easing: 'linear' }, { scale: `1 ${EYES_SHUT}`, offset: o(duration - EYES_OPEN_MS), easing: 'ease-in-out' }, { scale: '1 1', offset: 1 }], duration }
}

/** Танцевать ли: не в коробке (Мия на Пите) и не у слабого устройства / reduced-motion */
export const canDance = ({ boxed = false, lite = false, still = false } = {}) => !boxed && !lite && !still

/**
 * Запустить танец на корне игры game (.wl). → stop() (снять анимации) или null (нет Пита / нельзя / в коробке). Журнал: «[dance] …».
 */
export function startNoteDance({ game, lite = false, still = false, step = DANCE_STEP_MS, log = () => {} } = {}) {
  const cat = game?.querySelector?.('[data-testid="wl-cat"]')
  const boxed = !!game?.querySelector?.('.wlMia[data-live]')
  if (!cat?.animate || !canDance({ boxed, lite, still })) { try { log(`[dance] танца нет: ${!cat ? 'нет Пита' : boxed ? 'Пит в коробке' : 'слабое устройство / reduced-motion'}`) } catch { /* журнал */ } return null }
  const stage = cat.parentElement, stageW = stage?.offsetWidth || 375, headW = cat.offsetWidth && stageW ? (cat.offsetWidth / stageW) * 100 : 50
  const x0 = Number(cat.dataset.dodgeX) || Number(cat.style.getPropertyValue('--cat-x')) || 50
  const { frames, duration } = danceFrames({ x0, headW, stageW, step })
  const anims = [cat.animate(frames, { duration, fill: 'none' })]
  const ef = eyeFrames(duration)
  for (const eyes of cat.querySelectorAll?.('[data-part="eyes"]') ?? []) {
    if (eyes.style) { eyes.style.transformBox = 'fill-box'; eyes.style.transformOrigin = 'center' }
    if (eyes.animate) anims.push(eyes.animate(ef.frames, { duration, fill: 'none' }))
  }
  try { log(`[dance] танец на трёх нотах: x ${x0.toFixed(0)} % → угол → угол → угол → назад, ${Math.round(duration)} мс, с остановками в углах; только глаза закрыты`) } catch { /* журнал */ }
  return () => { for (const a of anims) { try { a.cancel() } catch { /* уже снята */ } } }
}
