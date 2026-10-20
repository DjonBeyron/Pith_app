import { SCENE_W, SCENE_H } from '../../../scene/v2/sprites/backgrounds.js'
import { normalizeSceneCrop, SCENE_CROP_REF_W } from '../../../scene/v2/sceneNodeCrop.js'

// Кадрирование сцены 9:16 в круглую вставку (режим 'circle' ноды scene) —
// чистая геометрия, без React. Коты стоят внизу сцены (их верх ≈ y 444 в
// viewBox 0 0 360 640, головы ≈ 444…520), облачко в режиме кружка — по
// центру над головами (scene.css: низ ≈ y 384, верх ≈ 300). Круг диаметром D
// показывает полосу сцены шириной SHOW_W единиц с центром в (180, CENTER_Y):
// в кадре — обе головы и облачко, пол и потолок обрезаны. Одиночная сцена
// (один кот по центру, scenePit.js; solo: true) — кадр в 3 раза крупнее: кот почти во всю ширину круга
// (облачка в кружке нет никогда, sceneNode.js — кадру не нужно место над головой). Те же числа в процентах — scene-picker.css (.nodeScenePreview--circle).
// crop ({x, y, scale}, как у видео-кружка; sceneNodeCrop.js) — масштаб содержимого вокруг центра круга и сдвиг:
// x/y заданы в px круга диаметром 200 и пересчитываются на фактический диаметр. Без crop — как раньше.
// Возвращает стиль абсолютно позиционированной обёртки сцены внутри круглой
// рамки (сама сцена — width 100%, aspect-ratio 9/16).

export const CIRCLE_SHOW_W = 340
export const CIRCLE_CENTER_Y = 410
// Одиночный кот (кружок Пита, без облачка): кот ровно в 3 раза крупнее прежнего кадра (было showW 320, centerY 416 — кот в 1/3 диаметра):
// круг показывает полосу шириной ≈107 ед. (320/3) (кот шириной ≈ 104 ед. почти во всю ширину), уши целиком, голова и плечи в круге
export const CIRCLE_SOLO = { showW: 320 / 3, centerY: 520 }

export function sceneCircleFit(diameter, {
  solo = false, showW = solo ? CIRCLE_SOLO.showW : CIRCLE_SHOW_W, centerY = solo ? CIRCLE_SOLO.centerY : CIRCLE_CENTER_Y, crop = null,
} = {}) {
  const d = Math.max(0, Number(diameter) || 0)
  const c = normalizeSceneCrop(crop)
  const u = d / SCENE_CROP_REF_W
  const w = d * SCENE_W / showW * c.scale
  const h = w * SCENE_H / SCENE_W
  return {
    position: 'absolute',
    width: Math.round(w * 100) / 100 + 'px',
    height: Math.round(h * 100) / 100 + 'px',
    left: Math.round((-(w - d) / 2 + c.x * u) * 100) / 100 + 'px',
    top: Math.round((d / 2 - centerY / SCENE_H * h + c.y * u) * 100) / 100 + 'px',
  }
}

// Тот же кадр, но НЕ гигантской обёрткой, а окном viewBox у самой сцены: видимая в круге область сцены, квадрат со стороной
// showW / scale единиц, центр — (180 + сдвиг x, centerY + сдвиг y). Слой сцены при этом размером с круг, а не в ~20 раз больше
// (обёртка sceneCircleFit — 3,4 d × 6 d, растёт ещё вдвое при раскрытии: на iPhone такой слой не помещается в текстуру, плитки
// гаснут — «чёрные мелькания» при появлении и тапе). Сдвиг x/y в единицах сцены не зависит от диаметра (x px круга d=200 → showW/200 ед.)
export function sceneCircleViewBox({
  solo = false, showW = solo ? CIRCLE_SOLO.showW : CIRCLE_SHOW_W, centerY = solo ? CIRCLE_SOLO.centerY : CIRCLE_CENTER_Y, crop = null,
} = {}) {
  const c = normalizeSceneCrop(crop)
  const side = showW / c.scale
  const k = showW / (SCENE_CROP_REF_W * c.scale)
  const r = v => Math.round(v * 1000) / 1000
  return `${r(SCENE_W / 2 - side / 2 - c.x * k)} ${r(centerY - side / 2 - c.y * k)} ${r(side)} ${r(side)}`
}
