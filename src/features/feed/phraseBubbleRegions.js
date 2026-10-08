// Облачка по словам для шариков-спойлера (phraseBubbleDraw.buildGrid при заданных regions) — геометрия без DOM
// (phraseBubbleRegions.test.js). Регионы — прямоугольники слов { x, y, w, h } относительно текстового блока
// (CatchStripPhrase меряет span'ы слов). Тут: запас вокруг слова, чтобы облачко было чуть шире слова, но не
// доставало до соседа, и порядок/выбор регионов для поочерёдного взрыва.

export const REGION_PAD = 4      // запас облачка по сторонам слова, px
export const REGION_VPAD = 3     // запас сверху и снизу
export const REGION_MIN_GAP = 8  // слова ближе — запас сокращается
const REGION_CLEAR = 1           // зазор, который оставляем чистым, когда запас режется по зазору

// Слова на одной строке: по вертикали пересекаются больше чем на половину меньшей высоты
const sameLine = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2

// Запас с одной стороны: зазор до соседа на этой стороне (gap) ≥ REGION_MIN_GAP — полный запас; меньше — половина зазора
// (минус чистый миллиметр), чтобы два соседних облачка вместе не съедали промежуток между словами; нет соседа — полный
const padForGap = gap => (gap == null || gap >= REGION_MIN_GAP ? REGION_PAD : Math.max(0, gap / 2 - REGION_CLEAR))

// Прямоугольники слов → прямоугольники облачков: каждый расширен на запас; слева/справа запас зависит от ближайшего
// соседа на той же строке. Порядок и число регионов сохраняются
export function padRegions(regions) {
  return regions.map((r, i) => {
    let gapL = null
    let gapR = null
    regions.forEach((o, j) => {
      if (i === j || !sameLine(r, o)) return
      if (o.x >= r.x + r.w - 0.5) { const g = o.x - (r.x + r.w); if (gapR == null || g < gapR) gapR = g }
      else if (o.x + o.w <= r.x + 0.5) { const g = r.x - (o.x + o.w); if (gapL == null || g < gapL) gapL = g }
    })
    const l = padForGap(gapL)
    const rt = padForGap(gapR)
    return { x: r.x - l, y: r.y - REGION_VPAD, w: r.w + l + rt, h: r.h + REGION_VPAD * 2 }
  })
}

// Какие регионы уже взорваны: explode — true (все) | число n (первые n по порядку) | массив индексов; count — сколько регионов
export function explodedRegions(explode, count) {
  if (explode === true) return new Set(Array.from({ length: count }, (_, i) => i))
  if (typeof explode === 'number') return new Set(Array.from({ length: Math.min(Math.max(0, explode), count) }, (_, i) => i))
  if (Array.isArray(explode)) return new Set(explode.filter(i => i >= 0 && i < count))
  return new Set()
}

// Есть ли команда на взрыв вообще (хоть один регион или «все»): явное true / число > 0 / непустой массив
export const hasExplode = explode => explode === true || (typeof explode === 'number' && explode > 0) || (Array.isArray(explode) && explode.length > 0)

// Подпись набора регионов для зависимостей эффектов (координаты с точностью до 0.5px — субпиксельный шум не пересобирает сетку)
export const regionsKey = regions => (regions ? regions.map(r => `${Math.round(r.x * 2)},${Math.round(r.y * 2)},${Math.round(r.w * 2)},${Math.round(r.h * 2)}`).join('|') : '')
