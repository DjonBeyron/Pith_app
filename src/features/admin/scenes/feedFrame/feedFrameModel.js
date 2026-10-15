import { isDefaultFeedFrame, normalizeFeedFrame, resolveFeedFrame } from '../../../scene/v2/sceneFeedFrame.js'
import { computeFeedFrame } from '../../../feed/scene/feedFrameCalc.js'
import { FEED_DEVICES, navHeight } from '../../../feed/scene/feedSlideGeometry.js'

// Модель предпросмотра «Как в ленте» (чистые функции, без React): запись кадра в сцену, расчёт для выбранного экрана,
// ключ кадра, выбор реплики для облачка. Геометрия — ТА ЖЕ, что в ленте (feed/scene/feedSlideGeometry.js + feedFrameCalc.js).

// Записать кадр в сцену. Кадр «по умолчанию» (масштаб 1, сдвиг 0, якорь bottom) или null — поле убирается:
// сцена остаётся такой же, как до настройки
export function setFeedFrame(scene, frame) {
  const { feedFrame: _old, ...rest } = scene.options ?? {}
  if (!frame || isDefaultFeedFrame(frame)) return { ...scene, options: rest }
  return { ...scene, options: { ...rest, feedFrame: normalizeFeedFrame(frame) } }
}

export const frameKey = f => { const r = resolveFeedFrame({ feedFrame: f }); return `${r.scale}|${r.x}|${r.y}|${r.anchor}` }

export const deviceById = id => FEED_DEVICES.find(d => d.id === id) ?? FEED_DEVICES[0]

// Размеры и переменные слайда-макета: ровно то, что в живой ленте даёт оболочка (высота нижней панели, safe-area сверху)
export function previewSlideSpec(device) {
  return {
    w: device.w, h: device.h, navH: navHeight(device.sab), safeTop: device.sat,
    style: { width: device.w, height: device.h, '--v2-nav-h': `${navHeight(device.sab)}px`, '--feed-sat': `${device.sat}px` },
  }
}

// Расчёт кадра для экрана предпросмотра (solo — сцена с одним котом)
export function previewCalc(device, frame, solo = false) {
  const { w, h, navH, safeTop } = previewSlideSpec(device)
  return computeFeedFrame({ w, h, navH, safeTop, frame, solo })
}

// Реплика для облачка в статичном кадре: самая длинная (худший случай по высоте облачка)
export function longestLineIndex(scene) {
  let best = 0
  ;(scene.timeline ?? []).forEach((l, i) => { if (String(l.text).length > String(scene.timeline[best].text).length) best = i })
  return best
}

// Масштаб макета под колонку: целиком по ширине и не выше maxH
export function previewZoom(device, boxW, maxH = 560) {
  if (!boxW) return 1
  return Math.max(0.2, Math.min(1, boxW / device.w, maxH / device.h))
}

// Сводка кадра для панели «Параметры воспроизведения»: «по умолчанию» или «×1.2, X 0.1, Y −0.05, якорь: центр»
const ANCHOR_RU = { top: 'верх', center: 'центр', bottom: 'низ' }
export function feedFrameSummary(frame) {
  if (isDefaultFeedFrame(frame)) return 'по умолчанию (ноги котов над блоком фразы и кнопкой)'
  const f = resolveFeedFrame({ feedFrame: frame })
  const n = v => String(v).replace('-', '−')
  return `×${f.scale}, X ${n(f.x)}, Y ${n(f.y)}, якорь: ${ANCHOR_RU[f.anchor]}`
}
