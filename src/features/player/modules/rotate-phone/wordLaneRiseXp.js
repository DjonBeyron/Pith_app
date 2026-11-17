// Взлёт принятой пилюли В СЧЁТЧИК XP (владелец, v3.3.271: «верные пилюли по синусоиде улетают в счётчик XP, анимацию полёта XP убираем; пилюля прилетела — счётчик распухает, и от него вверх идёт «+N XP»»).
// Вместо прямого взлёта вверх (wordLaneRise.js) пилюля идёт к центру счётчика .wlXp по линии с синусоидой поперёк пути (XP_WAVE_PX, XP_WAVES полупериодов; на старте и в конце сдвиг 0 — конец ровно в счётчике),
// сжимаясь (XP_SCALE_END) и гаснет на последних XP_FADE_FROM…1: «растворилась в счётчике». Всё ОДНОЙ WAAPI-анимацией (translate + rotate + scale + opacity), как у обычного взлёта: первый кадр пишет только translate
// (хлопок щелчка может ещё идти), задержка RISE_DELAY_MS держит пилюлю на месте. Путь по y — в % высоты экрана (как кадры взлёта), по x — px от центра пилюли до центра счётчика.
import { wavePosition, waveRotate, tiltDeg, viewHeightPx } from './wordLaneWave.js'
import { RISE_DELAY_MS, RISE_EASING } from './wordLaneRise.js'

export const XP_RISE_MS = 900        // сам полёт в счётчик
export const XP_WAVE_PX = 30         // размах синусоиды поперёк пути
export const XP_WAVES = 1.5          // периодов синусоиды за полёт (на старте и в конце сдвиг 0)
export const XP_SCALE_END = 0.28     // масштаб у счётчика
export const XP_FADE_FROM = 0.82     // с какой доли пути пилюля гаснет
export const XP_ARRIVE_MS = RISE_DELAY_MS + XP_RISE_MS // от принятия до прилёта в счётчик: к этому моменту счётчик распухает и из него идёт «+N XP»
const STEPS = 28
const smooth = t => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x) }

/** Центр элемента {x, y} в px окна или null (нет элемента / не измерить) */
export function centerOf(el) {
  const r = el?.getBoundingClientRect?.()
  return r && (r.width || r.height) ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}

/** Сдвиг по x (px) на доле пути o: линия к счётчику + синусоида, затухающая к концу (на конце ровно dxEnd) */
export function xpRiseX(o, dxEnd) {
  return dxEnd * o + XP_WAVE_PX * Math.sin(2 * Math.PI * XP_WAVES * o) * (1 - 0.6 * o)
}

/** Кадры полёта: y0 — откуда (% высоты), endY — куда (% высоты), dxEnd — px по x до центра счётчика */
export function riseXpFrames(y0, endY, dxEnd, h = viewHeightPx()) {
  const marks = new Set([XP_FADE_FROM])
  for (let i = 0; i <= STEPS; i++) marks.add(i / STEPS)
  const at = o => ({ x: xpRiseX(o, dxEnd), y: y0 + (endY - y0) * o })
  return [...marks].sort((a, b) => a - b).map(o => {
    const p = at(o), q = at(Math.min(1, o + 0.02)), r = at(Math.max(0, o - 0.02))
    const f = { offset: o, translate: wavePosition(p.y, p.x), rotate: waveRotate(tiltDeg(q.x - r.x, ((q.y - r.y) / 100) * h)) } // наклон по касательной (потолок TILT_MAX_DEG)
    if (o > 0) f.scale = Number((1 - (1 - XP_SCALE_END) * smooth(o)).toFixed(4))
    if (o === XP_FADE_FROM) f.opacity = 1
    if (o === 1) f.opacity = 0
    return f
  })
}

/** Запустить полёт пилюли el в счётчик: Animation (finished — пилюлю можно вернуть в пул) */
export function startRiseXp(el, y0, endY, dxEnd, delay = RISE_DELAY_MS) {
  return el.animate(riseXpFrames(y0, endY, dxEnd), { duration: XP_RISE_MS, delay, easing: RISE_EASING, fill: 'both' })
}
