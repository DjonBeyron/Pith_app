// Чистая геометрия зоны — визуальной рамки-группировки нод на холсте автора
// (см. PROJECT.md, «Зоны»). Зона НЕ часть сценария урока: ученик её не видит,
// на плеер не влияет, это разметка холста только для автора.
//
// Те же приёмы, что и у стикера комментария продакшена (noteBoxGeom.js):
// растягивание за одну из восьми ручек по сторонам/углам, минимальный размер,
// чтобы не схлопнуть зону в точку протяжкой.

export const MIN_ZONE_W = 120
export const MIN_ZONE_H = 90

// Цвет зоны по умолчанию — брендовый лайм, тот же, что был жёстко зашит в
// CSS до того как зоны научились задавать свой цвет (см. zoneColorVars)
export const DEFAULT_ZONE_COLOR = '#b6fe3b'

// Небольшая палитра под быстрый выбор в UI (ZoneBox.jsx) — семь узнаваемых
// цветов на разные смысловые куски сценария (Часть 1/2/3/4, тренировки и
// т.п.), плюс сам DEFAULT_ZONE_COLOR как первый пункт
export const ZONE_COLOR_PRESETS = [
  DEFAULT_ZONE_COLOR, '#5fb8ff', '#ff9f5f', '#ff6fae', '#a07fd4', '#ffd75f', '#6bd4a0',
]

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
    color: DEFAULT_ZONE_COLOR,
  }
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!m) return { r: 182, g: 254, b: 59 } // DEFAULT_ZONE_COLOR — если цвет битый/старой зоны без поля
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

// Зона хранит один hex-цвет — здесь он расходится на CSS-переменные с нужной
// автору прозрачностью (рамка/фон/ручки/ручки-под-курсором), см. zones.css.
// Ставятся один раз на корневой .canvasZone и наследуются вниз до ручек —
// не нужно прокидывать цвет в каждую из восьми отдельно.
export function zoneColorVars(hex) {
  const { r, g, b } = hexToRgb(hex)
  const rgb = `${r}, ${g}, ${b}`
  return {
    '--zoneBorder':    `rgba(${rgb}, 0.32)`,
    '--zoneBg':        `rgba(${rgb}, 0.045)`,
    '--zoneGrip':      `rgba(${rgb}, 0.22)`,
    '--zoneGripHover': `rgba(${rgb}, 0.65)`,
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
