// Геометрия стикера с комментарием продакшена: перетаскивание и растягивание
// за любую из восьми ручек. Чистые функции — их же проверяют тесты.

export const MIN_W = 120
export const MIN_H = 60

// dir — из каких сторон тянут: 'n','s','e','w' и углы 'ne','nw','se','sw'.
// Тянем за верх/лево — двигается и сам угол стикера, поэтому x/y меняются
// вместе с шириной/высотой, иначе стикер «уезжал» бы из-под курсора.
export function applyResize(box, dir, dx, dy) {
  let { x, y, w, h } = box
  if (dir.includes('e')) w = Math.max(MIN_W, box.w + dx)
  if (dir.includes('s')) h = Math.max(MIN_H, box.h + dy)
  if (dir.includes('w')) {
    w = Math.max(MIN_W, box.w - dx)
    x = box.x + (box.w - w)
  }
  if (dir.includes('n')) {
    h = Math.max(MIN_H, box.h - dy)
    y = box.y + (box.h - h)
  }
  return { x, y, w, h }
}

export function applyMove(box, dx, dy) {
  return { ...box, x: box.x + dx, y: box.y + dy }
}

// Линия к ноде рисуется от центра ноды к центру стикера и уходит ПОД них
// обоих — так связь видно при любом положении стикера, и она не перечёркивает
// ни текст заметки, ни саму ноду.
export function linkLine(node, box) {
  return {
    x1: node.w / 2, y1: node.h / 2,
    x2: box.x + box.w / 2, y2: box.y + box.h / 2,
  }
}
