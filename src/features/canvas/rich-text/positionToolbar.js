// Позиционирование плавающего тулбара СБОКУ от выделения текста (не над ним —
// так текст рядом с выделением не перекрывается), с клампингом по краям
// окна. viewport передаётся явно (а не читается из window), чтобы функция
// была юнит-тестируемой без DOM-окружения.
const GAP = 10
const MARGIN = 8

export function positionToolbar(selectionRect, barWidth, barHeight, viewport, lineHeight = 18) {
  if (!selectionRect || !viewport) return null

  // По умолчанию — справа от выделения; не влезает у правого края экрана —
  // разворачиваем налево, а не сжимаем/наезжаем на текст
  const fitsRight = selectionRect.right + GAP + barWidth <= viewport.width - MARGIN
  const left = fitsRight
    ? selectionRect.right + GAP
    : Math.max(MARGIN, selectionRect.left - GAP - barWidth)

  // Приподнимаем на две строки от верха выделения — тулбар не наезжает
  // прямо на текущую строку текста сбоку от себя
  const top = Math.max(
    MARGIN,
    Math.min(selectionRect.top - lineHeight * 2, viewport.height - barHeight - MARGIN),
  )

  return { left, top }
}
