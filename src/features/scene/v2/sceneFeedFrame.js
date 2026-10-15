import { isObj } from './sceneConstants.js'

// Кадрирование сцены в ленте — необязательное поле scene.options.feedFrame (версия формата остаётся 2,
// старые сцены без поля валидны и не меняются). Применяется ТОЛЬКО к слайду ленты (feed/scene/SlideScene.jsx):
// у ноды урока, кружка и полного экрана свои рамки. Геометрию считает feed/scene/feedFrameCalc.js.
//   scale  0.6…1.6 (1)   — масштаб сцены вокруг «ног» котов (коты не уезжают под кнопку при приближении)
//   x, y   −1…1 (0)      — сдвиг в долях кадра (ширины / высоты слайда); 0 = положение по умолчанию
//   anchor 'top' | 'center' | 'bottom' — откуда считать положение: bottom (по умолчанию) — ноги котов ставятся
//          прямо над блоком фразы и кнопкой; center — коты по центру свободной полосы; top — старый вид
//          (сцена прижата к верху, низ слайда — цвет пола)

export const FEED_FRAME_LIMITS = { scaleMin: 0.6, scaleMax: 1.6, shiftMin: -1, shiftMax: 1 }
export const FEED_FRAME_ANCHORS = ['top', 'center', 'bottom']
export const DEFAULT_FEED_ANCHOR = 'bottom'
export const DEFAULT_FEED_FRAME = { scale: 1, x: 0, y: 0 }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const round3 = v => Math.round(v * 1000) / 1000

// Любой вход → полный кадр { scale, x, y, anchor? } с зажатыми диапазонами; не объект → null (поля нет).
// anchor пишется только если задан верно — иначе действует умолчание
export function normalizeFeedFrame(raw) {
  if (!isObj(raw)) return null
  const L = FEED_FRAME_LIMITS
  const out = {
    scale: round3(clamp(num(raw.scale, 1), L.scaleMin, L.scaleMax)),
    x: round3(clamp(num(raw.x, 0), L.shiftMin, L.shiftMax)),
    y: round3(clamp(num(raw.y, 0), L.shiftMin, L.shiftMax)),
  }
  if (FEED_FRAME_ANCHORS.includes(raw.anchor)) out.anchor = raw.anchor
  return out
}

// Кадр «как по умолчанию» (масштаб 1, нулевой сдвиг, якорь не задан или bottom) — поле в сцене не нужно
export function isDefaultFeedFrame(frame) {
  const f = normalizeFeedFrame(frame)
  return !f || (f.scale === 1 && f.x === 0 && f.y === 0 && (f.anchor ?? DEFAULT_FEED_ANCHOR) === DEFAULT_FEED_ANCHOR)
}

// Эффективный кадр с умолчаниями (всегда полный, anchor задан)
export function resolveFeedFrame(options) {
  const f = normalizeFeedFrame(options?.feedFrame) ?? DEFAULT_FEED_FRAME
  return { ...DEFAULT_FEED_FRAME, ...f, anchor: f.anchor ?? DEFAULT_FEED_ANCHOR }
}

// Ошибки формата (зовёт validateSceneOptions). Выход за диапазон — не ошибка: нормализация зажимает
export function validateFeedFrame(v, errors) {
  if (!isObj(v)) { errors.push('options.feedFrame — объект { scale, x, y, anchor? }'); return }
  for (const [k, val] of Object.entries(v)) {
    if (k === 'scale' || k === 'x' || k === 'y') {
      if (typeof val !== 'number' || !Number.isFinite(val)) errors.push(`options.feedFrame.${k} — число`)
    } else if (k === 'anchor') {
      if (!FEED_FRAME_ANCHORS.includes(val)) errors.push(`options.feedFrame.anchor — ${FEED_FRAME_ANCHORS.join(' | ')}`)
    } else errors.push(`options.feedFrame.${k} — лишнее поле (scale, x, y, anchor)`)
  }
}
