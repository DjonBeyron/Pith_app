// Положение всплывающей подсказки рядом с кнопкой «?» — чистая функция без DOM.
// anchor — прямоугольник кнопки (left/top/right/bottom, как getBoundingClientRect),
// size — размеры подсказки { w, h }, viewport — окно { w, h }. Подсказка по центру
// под кнопкой; не влезает снизу — над ней; по горизонтали прижимается к краям
// окна с полем margin. Если высоты не хватает ни там, ни там — берём сторону
// пошире и режем высоту (maxHeight), внутри подсказка прокручивается.
export function popoverPosition(anchor, size, viewport, { margin = 8, gap = 6 } = {}) {
  const w = Math.min(size.w, viewport.w - margin * 2)
  const cx = (anchor.left + anchor.right) / 2
  const left = Math.max(margin, Math.min(cx - w / 2, viewport.w - w - margin))

  const below = viewport.h - margin - (anchor.bottom + gap)
  const above = anchor.top - gap - margin
  let placement = 'below'
  if (size.h > below && above > below) placement = 'above'
  const room = placement === 'below' ? below : above
  const h = Math.min(size.h, Math.max(room, 0))
  const top = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - h
  return { left, top: Math.max(margin, top), width: w, maxHeight: Math.max(room, 0), placement }
}
