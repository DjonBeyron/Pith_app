import { SCENE_W, SCENE_H } from '../../../scene/v2/sprites/backgrounds.js'

// Кадрирование сцены 9:16 в круглую вставку (режим 'circle' ноды scene) —
// чистая геометрия, без React. Коты стоят внизу сцены (их верх ≈ y 444 в
// viewBox 0 0 360 640, головы ≈ 444…520), облачко в режиме кружка — по
// центру над головами (scene.css: низ ≈ y 384, верх ≈ 300). Круг диаметром D
// показывает полосу сцены шириной SHOW_W единиц с центром в (180, CENTER_Y):
// в кадре — обе головы и облачко, пол и потолок обрезаны. Одиночная сцена
// (один кот по центру, scenePit.js; solo: true) — кадр чуть ближе и ниже: одна
// голова ровно в центре круга, облачко (в кружке оно уже — scene.css [data-solo])
// целиком в круге. Те же числа в процентах — scene-picker.css (.nodeScenePreview--circle).
// Возвращает стиль абсолютно позиционированной обёртки сцены внутри круглой
// рамки (сама сцена — width 100%, aspect-ratio 9/16).

export const CIRCLE_SHOW_W = 340
export const CIRCLE_CENTER_Y = 410
export const CIRCLE_SOLO = { showW: 320, centerY: 416 }

export function sceneCircleFit(diameter, { solo = false, showW = solo ? CIRCLE_SOLO.showW : CIRCLE_SHOW_W, centerY = solo ? CIRCLE_SOLO.centerY : CIRCLE_CENTER_Y } = {}) {
  const d = Math.max(0, Number(diameter) || 0)
  const w = d * SCENE_W / showW
  const h = w * SCENE_H / SCENE_W
  return {
    position: 'absolute',
    width: Math.round(w * 100) / 100 + 'px',
    height: Math.round(h * 100) / 100 + 'px',
    left: Math.round(-(w - d) / 2 * 100) / 100 + 'px',
    top: Math.round((d / 2 - centerY / SCENE_H * h) * 100) / 100 + 'px',
  }
}

// Кольцо прогресса по репликам (у сцены нет длительности в секундах):
// доля пройденных реплик → stroke-dashoffset. ended — кольцо полное,
// idle — пустое; playing/paused — текущая реплика считается наполовину.
export function ringOffset({ status, index, total }, circumference) {
  if (!total || status === 'idle') return circumference
  if (status === 'ended') return 0
  const done = Math.min(total, index + 0.5)
  return circumference * (1 - done / total)
}
