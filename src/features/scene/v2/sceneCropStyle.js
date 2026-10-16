import { normalizeSceneCrop, isDefaultCrop, SCENE_CROP_REF_W } from './sceneNodeCrop.js'
import { SCENE_W, SCENE_H } from './sprites/backgrounds.js'

// Масштаб/сдвиг кадра сцены 9:16 (пузырь ленты, полный экран, превью в редакторе) — ОДНА функция на всех:
// слой-обёртка вокруг сцены (position:absolute; inset:0), transform вокруг центра, как у видео (circleFit.js:
// translate → scale). Сдвиг в процентах СВОЕЙ рамки: x px при ширине кадра 200 = x/200 ширины, y — доля
// от высоты кадра 200·16/9. Поэтому размер кадра знать не нужно: тот же crop одинаково выглядит в пузыре,
// на весь экран и в редакторе. Умолчание ({0,0,1}) → undefined: обёртка не нужна, DOM как у старых нод.
export const SCENE_CROP_REF_H = SCENE_CROP_REF_W * SCENE_H / SCENE_W

export function sceneBubbleCropStyle(crop) {
  if (isDefaultCrop(crop)) return undefined
  const c = normalizeSceneCrop(crop)
  const px = Math.round(c.x / SCENE_CROP_REF_W * 100 * 1000) / 1000
  const py = Math.round(c.y / SCENE_CROP_REF_H * 100 * 1000) / 1000
  return {
    position: 'absolute', inset: 0,
    transform: `translate(${px}%, ${py}%) scale(${c.scale})`,
    transformOrigin: 'center center',
  }
}
