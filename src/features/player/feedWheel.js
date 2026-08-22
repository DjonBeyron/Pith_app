// Лента чата перевёрнута приёмом scaleY(-1) (feed.css): scrollTop=0 — это
// визуальный низ, поэтому новые сообщения всегда видны без JS. Колесо мыши
// про этот переворот не знает — браузер прибавляет deltaY к scrollTop, и на
// десктопе лента ехала в обратную сторону. Считаем сдвиг сами и вычитаем.
//
// deltaMode: 0 — пиксели, 1 — строки (Firefox), 2 — страницы.
const LINE_PX = 16

export function wheelScrollShift(deltaY, deltaMode = 0, clientHeight = 0) {
  const k = deltaMode === 1 ? LINE_PX : deltaMode === 2 ? (clientHeight || LINE_PX) : 1
  return -deltaY * k
}
