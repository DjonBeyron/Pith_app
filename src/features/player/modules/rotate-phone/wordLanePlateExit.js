// Уход центральных плашек игры («Теперь твоя очередь», названия раундов и актов, «Дубль»; WordLaneTurnPlate.jsx): плашка улетает вверх так же, как взлетает принятая пилюля (замечание владельца v3.3.85) —
// по растянутой синусоиде с наклоном по касательной, сжимаясь до искры и гаснув на последних 25 % пути. Кривая ТА ЖЕ, не копия: riseFrames (wordLaneRise.js) строит кадры из высоты старта и функции формата translate;
// пилюля отдаёт ей положение на экране (wavePosition), плашка — сдвиг от своего места (она стоит по центру вёрсткой, поэтому у неё translate — относительный). Длительность и easing — RISE_MS / RISE_EASING.
// На слабом устройстве (lite) и при reduced-motion полёта нет — простое затухание (CSS .wlTurn--leave, PLATE_EXIT_LITE_MS). Плашка остаётся в DOM на время ухода: её держит useWordLaneLeavingPlates.js.
import { riseFrames, RISE_MS, RISE_EASING } from './wordLaneRise.js'
import { viewHeightPx } from './wordLaneWave.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'

export const PLATE_EXIT_MS = RISE_MS      // уход как взлёт пилюли
export const PLATE_EXIT_LITE_MS = 250     // простое затухание lite (то же число в word-lane-plate.css, wlTurnFadeOut)
export const PLATE_EXIT_SLACK_MS = 60     // запас, чтобы плашку убрали из DOM после последнего кадра, а не до него

/** lite-режим плашки: слабое устройство или reduced-motion — без полёта и колебания */
export function plateLite() {
  const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return isWeakDevice() || reduce
}

/** Сколько плашка уходит (мс): полёт как у пилюли или затухание lite */
export const plateExitMs = lite => (lite ? PLATE_EXIT_LITE_MS : PLATE_EXIT_MS)

/** Формат translate кадра для плашки: сдвиг (px) от места, где она стоит; y — центр в % высоты экрана (как у пилюли), y0 — откуда стартовала */
const shiftFrom = (y0, h) => (y, dx) => `${dx.toFixed(2)}px ${(((y - y0) / 100) * h).toFixed(2)}px`

/** Кадры ухода плашки с центром на высоте y0 (% высоты экрана h): те же кадры, что у взлёта пилюли, в сдвиге от места плашки */
export const plateExitFrames = (y0, h = viewHeightPx()) => riseFrames(y0, h, shiftFrom(y0, h))

/** Запустить уход плашки el: высота старта — по её нынешнему центру на экране. Возвращает Animation (или null, если WAAPI нет) */
export function startPlateExit(el) {
  if (!el || typeof el.animate !== 'function') return null
  const h = viewHeightPx()
  const r = el.getBoundingClientRect()
  const y0 = r.height > 0 ? ((r.top + r.height / 2) / h) * 100 : 50
  return el.animate(plateExitFrames(y0, h), { duration: PLATE_EXIT_MS, easing: RISE_EASING, fill: 'both' })
}
