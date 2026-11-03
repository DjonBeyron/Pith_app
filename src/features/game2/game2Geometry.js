// Раскладка ленты в пикселях (чистые функции): лента едет вниз с постоянной скоростью, линия «сейчас» стоит на LINE_Y % высоты. Дорожка (track) — нулевой точкой служит момент 0 ленты:
// translateY(trackY(t)) двигает ВСЕ пилюли одним слоем. Пилюля ФИКСИРОВАННОЙ высоты (PILL_H: читается и попадается пальцем), её центр доезжает до линии ровно в начале слова.
// Масштаб времени на ленте (scale) один на всю фразу: если слова идут плотнее, чем позволяет зазор (≥ MIN_GAP_K высоты пилюли между соседями), лента растягивается (пиксели на мс растут), то есть едет быстрее;
// звук и часы ленты не трогаются. Растяжка считается по ВСЕМ словам фразы (в «Ловлю» видны не все, но лента та же, что в остальных режимах); потолок MAX_SCALE.
import { SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'

export const LINE_Y = 55          // линия «сейчас», % высоты экрана
export const LANE_WIDTH = 66      // ширина ленты, % ширины экрана
export const PILL_H = 44          // высота пилюли, px (одинаковая у всех слов, служебные не мельче)
export const MIN_GAP_K = 0.4      // минимальный зазор между соседними пилюлями, в долях высоты пилюли
export const MAX_SCALE = 5        // потолок растяжки (слова, начавшиеся почти одновременно, всё равно не растянуть бесконечно)
export const MIN_DT_MS = 30       // слова ближе друг к другу этого не учитываются при растяжке (ошибка таймингов)

/** Скорость ленты без растяжки, px в мс (SPEED из wordLaneTimeline.js — % высоты в секунду, как у игры) */
export const baseSpeed = h => (SPEED / 100 * h) / 1000

/** Скорость ленты, px в мс, с растяжкой scale */
export const pxPerMs = (h, scale = 1) => baseSpeed(h) * scale

/** Высота линии «сейчас», px от верха ленты */
export const lineY = h => (LINE_Y / 100) * h

/** Сдвиг дорожки в момент t (мс) */
export const trackY = (t, h, scale = 1) => lineY(h) + t * pxPerMs(h, scale)

/** Растяжка ленты: наименьший scale ≥ 1, при котором у каждой пары соседних слов центры разведены на PILL_H·(1 + MIN_GAP_K) px. pills — все слова фразы по порядку */
export function layoutScale(pills, h) {
  const need = PILL_H * (1 + MIN_GAP_K)
  const v = baseSpeed(h)
  let scale = 1
  for (let k = 1; k < pills.length; k++) {
    const dt = pills[k].startMs - pills[k - 1].startMs
    scale = Math.max(scale, need / (Math.max(dt, MIN_DT_MS) * v))
  }
  return Math.min(scale, MAX_SCALE)
}

/** Место пилюли в дорожке: { top, height } — центр лежит выше нуля ленты на startMs·скорость */
export function pillBox(p, h, scale = 1) {
  return { top: Math.round(-p.startMs * pxPerMs(h, scale) - PILL_H / 2), height: PILL_H }
}

/** Центр пилюли в момент t (мс), % высоты экрана — откуда стартует взлёт пойманной пилюли */
export function centerPct(box, t, h, scale = 1) {
  return ((trackY(t, h, scale) + box.top + box.height / 2) / h) * 100
}
