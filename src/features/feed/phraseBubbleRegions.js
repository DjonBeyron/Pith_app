// Облачка по словам для шариков-спойлера (phraseBubbleDraw.buildGrid при заданных regions) — геометрия без DOM
// (phraseBubbleRegions.test.js). Регионы — прямоугольники слов { x, y, w, h } относительно текстового блока
// (CatchStripPhrase меряет span'ы слов). Тут: запас вокруг слова, чтобы облачко было чуть шире слова, но не
// доставало до соседа, и порядок/выбор регионов для поочерёдного взрыва.

export const REGION_PAD = 3      // запас облачка по сторонам слова, px
export const REGION_VPAD = 3     // запас сверху и снизу
export const REGION_TOUCH_GAP = 6 // зазор меньше этого — облачка могут соприкасаться (по середине зазора), но не заходить дальше
const REGION_CLEAR = 1           // чистый зазор, который оставляем между облачками, когда слова не вплотную
// Большие промежутки (полоска «Ловли»: word-spacing ≈ 0.9em, зазор между словами ≥ ~14px) — облачку нужен весь зазор:
// запас, бахрома и размах покачивания должны помещаться без среза. С такого зазора чистый пиксель ослаблен до половины
// (по половине с каждой стороны остаётся просвет в ~1px на самом краю бахромы, а у плотной части он в разы больше)
const BIG_GAP = 12
const REGION_CLEAR_BIG = 0.5
const clearFor = gap => (gap >= BIG_GAP ? REGION_CLEAR_BIG : REGION_CLEAR)

// Слова на одной строке: по вертикали пересекаются больше чем на половину меньшей высоты
const sameLine = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2
// Перекрытие по горизонтали — слово выше/ниже стоит «над» этим (для зазора по вертикали)
const overlapsX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0

// На сколько px облачко (с радиусом, покачиванием и бахромой — всем, что реально рисуется) может выйти за край слова
// в сторону соседа с зазором gap: половина зазора минус чистый зазор (1px; для больших промежутков — полпикселя);
// зазор меньше REGION_TOUCH_GAP — ровно половина (облачка касаются на середине зазора, не дальше). Нет соседа
// (gap == null) — без ограничения
export const reachForGap = gap => {
  if (gap == null) return Infinity
  return Math.max(0, gap < REGION_TOUCH_GAP ? gap / 2 : gap / 2 - clearFor(gap))
}

// Запас сетки с одной стороны: полный, но не больше допустимого выноса за слово (и не заходя на чистый зазор)
const padFor = (full, gap) => (gap == null ? full : Math.min(full, Math.max(0, gap / 2 - clearFor(gap))))

// Зазоры от каждого слова до ближайшего соседа с четырёх сторон: слева/справа — слова той же строки, сверху/снизу —
// слова другой строки, лежащие над/под ним по горизонтали. null — соседа с этой стороны нет
function sideGaps(regions) {
  return regions.map((r, i) => {
    const g = { l: null, r: null, t: null, b: null }
    const put = (k, v) => { if (g[k] == null || v < g[k]) g[k] = v }
    regions.forEach((o, j) => {
      if (i === j) return
      if (sameLine(r, o)) {
        if (o.x >= r.x + r.w - 0.5) put('r', o.x - (r.x + r.w))
        else if (o.x + o.w <= r.x + 0.5) put('l', r.x - (o.x + o.w))
      } else if (overlapsX(r, o)) {
        if (o.y >= r.y + r.h - 0.5) put('b', o.y - (r.y + r.h))
        else if (o.y + o.h <= r.y + 0.5) put('t', r.y - (o.y + o.h))
      }
    })
    return g
  })
}

// Прямоугольники слов → прямоугольники облачков: каждый расширен на запас; запас с каждой стороны зависит от зазора до
// ближайшего соседа с этой стороны. Порядок и число регионов сохраняются
export function padRegions(regions) {
  return sideGaps(regions).map((g, i) => {
    const r = regions[i]
    const l = padFor(REGION_PAD, g.l)
    const rt = padFor(REGION_PAD, g.r)
    const t = padFor(REGION_VPAD, g.t)
    const b = padFor(REGION_VPAD, g.b)
    return { x: r.x - l, y: r.y - t, w: r.w + l + rt, h: r.h + t + b }
  })
}

// Границы, дальше которых не должен заходить НИ ОДИН шарик облачка (с учётом радиуса, дыхания и покачивания): слово ± reachForGap
// по каждой стороне; без соседа с стороны — ±Infinity. Используется buildGrid: прижимает амплитуду узлов и режет бахрому
export function regionLimits(regions) {
  return sideGaps(regions).map((g, i) => {
    const r = regions[i]
    return {
      x0: r.x - reachForGap(g.l), x1: r.x + r.w + reachForGap(g.r),
      y0: r.y - reachForGap(g.t), y1: r.y + r.h + reachForGap(g.b),
    }
  })
}

// Разлёт частиц при ВЗРЫВЕ НЕ ограничен: границы { x0, x1, y0, y1 } (координаты текстового блока) для каждого облачка — ±Infinity
// по всем сторонам. Раньше разлёт зажимался в сторону ещё живого соседа (слово + 0.75 зазора, ALIVE_REACH), и частицы упирались в
// него; теперь они летят поверх живых соседей (порядок слоёв — drawExplode: левые облачка выше правых), а ограничивает только край
// холста взрыва (затухание и зажим положения в drawExplode)
export function flightLimits(regions) {
  return regions.map(() => ({ x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity }))
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

// Наборы регионов совпадают с точностью до 1px (по каждой координате): замер слов дрожит на доли пикселя
// (округление sig до 0.5px переключается от шума), а облачко от этого не меняется
const regionsClose = (a, b) => a.length === b.length
  && a.every((r, i) => Math.abs(r.x - b[i].x) < 1 && Math.abs(r.y - b[i].y) < 1 && Math.abs(r.w - b[i].w) < 1 && Math.abs(r.h - b[i].h) < 1)

// Нужно ли пересобирать сетку: изменился набор регионов (sig = regionsKey) или размер блока заметно (≥ 2px — ResizeObserver
// иногда шлёт субпиксельный шум). prev/next — { w, h, sig, regions? }; prev == null — ещё не собирали. Если подпись другая,
// но оба набора регионов переданы и различаются меньше чем на 1px — пересборка не нужна (шум округления подписи)
export function needsRebuild(prev, next) {
  if (!next.w || !next.h) return false
  if (!prev) return true
  if (Math.abs(prev.w - next.w) >= 2 || Math.abs(prev.h - next.h) >= 2) return true
  if (prev.sig === next.sig) return false
  return !(prev.regions && next.regions && regionsClose(prev.regions, next.regions))
}
