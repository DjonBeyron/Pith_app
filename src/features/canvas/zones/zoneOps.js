// Чистая геометрия зоны — визуальной рамки-группировки нод на холсте автора
// (см. PROJECT.md, «Зоны»). Зона НЕ часть сценария урока: ученик её не видит,
// на плеер не влияет, это разметка холста только для автора.
//
// Те же приёмы, что и у стикера комментария продакшена (noteBoxGeom.js):
// растягивание за одну из восьми ручек по сторонам/углам, минимальный размер,
// чтобы не схлопнуть зону в точку протяжкой.

export const MIN_ZONE_W = 120
export const MIN_ZONE_H = 90

// Протяжка короче — случайный клик, а не «нарисовать зону»: без порога любой
// клик по холсту с активным инструментом плодил бы точечные зоны-мусор
const MIN_DRAG = 12

// a/b — мировые координаты начала и конца протяжки (см. useZoneDraw.js).
// Возвращает null, если протяжка слишком маленькая — вызывающий код тогда
// просто ничего не создаёт.
export function rectFromDrag(a, b) {
  const width  = Math.abs(a.x - b.x)
  const height = Math.abs(a.y - b.y)
  if (width < MIN_DRAG && height < MIN_DRAG) return null
  return {
    id: crypto.randomUUID(),
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(width, MIN_ZONE_W),
    height: Math.max(height, MIN_ZONE_H),
    label: 'Новая зона',
  }
}

export function applyZoneMove(zone, dx, dy) {
  return { ...zone, x: zone.x + dx, y: zone.y + dy }
}

// dir — как у ручек стикера: 'n','s','e','w' и углы 'ne','nw','se','sw'.
// Тянем за верх/лево — вместе с размером двигается и сам угол зоны (иначе
// она «убегала» бы из-под курсора при растягивании влево или вверх)
export function applyZoneResize(zone, dir, dx, dy) {
  let { x, y, width, height } = zone
  if (dir.includes('e')) width = Math.max(MIN_ZONE_W, zone.width + dx)
  if (dir.includes('s')) height = Math.max(MIN_ZONE_H, zone.height + dy)
  if (dir.includes('w')) {
    width = Math.max(MIN_ZONE_W, zone.width - dx)
    x = zone.x + (zone.width - width)
  }
  if (dir.includes('n')) {
    height = Math.max(MIN_ZONE_H, zone.height - dy)
    y = zone.y + (zone.height - height)
  }
  return { ...zone, x, y, width, height }
}
