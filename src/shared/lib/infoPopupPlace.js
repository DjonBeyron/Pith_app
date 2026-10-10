// Где поставить попап-пояснение InfoPopup.jsx: под кнопкой «i» (или над ней, если снизу тесно), по ширине не шире
// экрана, с полем у краёв, уголок смотрит на кнопку. Чистая функция — её проверяет infoPopupPlace.test.js.
// rect — коробка кнопки (getBoundingClientRect), vw/vh — размер видимой области окна.
// → { side: 'down' | 'up', left, width, caretX, maxHeight, top | bottom } — всё в px (position: fixed)
export const INFO_POP_MAX_W = 300
export const INFO_POP_EDGE = 12 // поле до края экрана
const GAP = 8 // от кнопки до края попапа (в него входит уголок)
const CARET_PAD = 18 // уголок не ближе этого к краю попапа — у скруглённого угла
const ENOUGH_H = 160 // столько места снизу достаточно, чтобы не переворачивать попап вверх
const MIN_H = 96

export function placeInfoPopup({ rect, vw, vh }) {
  const width = Math.max(200, Math.min(INFO_POP_MAX_W, vw - 2 * INFO_POP_EDGE))
  const cx = rect.left + rect.width / 2
  const left = Math.max(INFO_POP_EDGE, Math.min(Math.round(cx - width / 2), vw - width - INFO_POP_EDGE))
  const caretX = Math.round(Math.max(CARET_PAD, Math.min(cx - left, width - CARET_PAD)))
  const below = vh - rect.bottom - GAP - INFO_POP_EDGE
  const above = rect.top - GAP - INFO_POP_EDGE
  const down = below >= ENOUGH_H || below >= above
  const room = Math.max(MIN_H, Math.round(down ? below : above))
  return down
    ? { side: 'down', left, width, caretX, maxHeight: room, top: Math.round(rect.bottom + GAP) }
    : { side: 'up', left, width, caretX, maxHeight: room, bottom: Math.round(vh - rect.top + GAP) }
}
