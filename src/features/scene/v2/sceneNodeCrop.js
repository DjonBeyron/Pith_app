import { isObj } from './sceneConstants.js'

// Масштаб и сдвиг кадра сцены в ноде урока (typeData.scene.crop) — ТОТ ЖЕ формат, что у видео/кружка/фото:
// { x, y, scale } (video.crop, circle.crop; NodeMediaCrop.jsx): scale — множитель (1 = как раньше),
// x/y — сдвиг в px. Единицы сдвига у видео — px кадра в редакторе; у сцены кадр в плеере разного размера
// (кружок 200 px, пузырь ~230 px, полный экран — весь экран), поэтому x/y считаются в px КАДРА ШИРИНОЙ
// SCENE_CROP_REF_W (200): плеер умножает на ширина_кадра / 200, редактор — так же. Нет поля = { 0, 0, 1 } = старое поведение.
// Кружок: сдвиг/масштаб содержимого внутри круга (sceneCircleFit.js). Пузырь и полный экран: сдвиг/масштаб сцены
// внутри рамки (sceneBubbleCropStyle в sceneCropStyle.js). Диапазоны — SCENE_CROP_LIMITS (линтер урока их же проверяет).

export const SCENE_CROP_DEFAULT = Object.freeze({ x: 0, y: 0, scale: 1 })
export const SCENE_CROP_REF_W = 200
export const SCENE_CROP_LIMITS = Object.freeze({ scaleMin: 0.5, scaleMax: 4, shiftMax: 400 })

const num = v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v)
const fin = v => typeof v === 'number' && Number.isFinite(v)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round = (v, d) => { const m = 10 ** d; return Math.round(v * m) / m }

// Любые данные → { x, y, scale } в допустимых пределах; мусорное поле → его значение по умолчанию
export function normalizeSceneCrop(raw) {
  const o = isObj(raw) ? raw : {}
  const { scaleMin, scaleMax, shiftMax } = SCENE_CROP_LIMITS
  const x = num(o.x), y = num(o.y), s = num(o.scale)
  return {
    x: fin(x) ? round(clamp(x, -shiftMax, shiftMax), 1) : 0,
    y: fin(y) ? round(clamp(y, -shiftMax, shiftMax), 1) : 0,
    scale: fin(s) && s > 0 ? round(clamp(s, scaleMin, scaleMax), 3) : 1,
  }
}

export function isDefaultCrop(crop) {
  const c = normalizeSceneCrop(crop)
  return c.x === 0 && c.y === 0 && c.scale === 1
}

// Для линтера урока: список ошибок сырого значения (undefined — поле не задано, это нормально)
export function checkSceneCrop(raw) {
  if (raw === undefined) return []
  if (!isObj(raw)) return ['crop — объект { x, y, scale }']
  const { scaleMin, scaleMax, shiftMax } = SCENE_CROP_LIMITS
  const out = []
  for (const k of Object.keys(raw)) if (!['x', 'y', 'scale'].includes(k)) out.push(`crop.${k} — лишнее поле (допустимо x, y, scale)`)
  for (const k of ['x', 'y']) {
    if (raw[k] !== undefined && !(fin(raw[k]) && Math.abs(raw[k]) <= shiftMax)) out.push(`crop.${k} — число −${shiftMax}…${shiftMax} (px кадра шириной ${SCENE_CROP_REF_W})`)
  }
  if (raw.scale !== undefined && !(fin(raw.scale) && raw.scale >= scaleMin && raw.scale <= scaleMax)) out.push(`crop.scale — число ${scaleMin}…${scaleMax} (1 = как есть)`)
  return out
}
