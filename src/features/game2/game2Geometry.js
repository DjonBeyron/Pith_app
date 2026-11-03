// Раскладка ленты в пикселях (чистые функции): лента едет вниз с постоянной скоростью, линия «сейчас» стоит на LINE_Y % высоты. Дорожка (track) — нулевой точкой служит момент 0 ленты:
// translateY(trackY(t)) двигает ВСЕ пилюли одним слоем; пилюля лежит в дорожке выше нуля на startMs·v (нижний край = начало слова) и тянется вверх на длину слова.
import { SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'

export const LINE_Y = 55          // линия «сейчас», % высоты экрана
export const LANE_WIDTH = 60      // ширина ленты, % ширины экрана
export const MIN_PILL_PX = 30     // пилюля с подписью не ниже (служебные слова — SMALL_PILL_PX)
export const SMALL_PILL_PX = 22
export const SHRINK_FLOOR_PX = 14 // сжимается до этого, если слова идут вплотную
export const PILL_GAP_PX = 4

/** Скорость ленты, px в мс (SPEED из wordLaneTimeline.js — % высоты в секунду, как у игры) */
export const pxPerMs = h => (SPEED / 100 * h) / 1000

/** Высота линии «сейчас», px от верха ленты */
export const lineY = h => (LINE_Y / 100) * h

/** Сдвиг дорожки в момент t (мс) */
export const trackY = (t, h) => lineY(h) + t * pxPerMs(h)

/** Размер и место пилюли в дорожке: { top, height }. next — следующая показанная пилюля (чтобы не наезжать на неё) */
export function pillBox(p, next, h) {
  const v = pxPerMs(h)
  const natural = (p.endMs - p.startMs) * v
  const min = p.small ? SMALL_PILL_PX : MIN_PILL_PX
  const room = next ? (next.startMs - p.startMs) * v - PILL_GAP_PX : Infinity
  const height = Math.round(Math.max(Math.min(Math.max(natural, min), room), SHRINK_FLOOR_PX))
  return { top: Math.round(-p.startMs * v - height), height }
}

/** Центр пилюли в момент t (мс), % высоты экрана — откуда стартует взлёт пойманной пилюли */
export function centerPct(box, t, h) {
  return ((trackY(t, h) + box.top + box.height / 2) / h) * 100
}
