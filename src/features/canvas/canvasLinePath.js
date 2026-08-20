// Геометрия линий между нодами — схемная разводка: линия идёт горизонталями и
// вертикалями, углы скруглены. Такой вид принят в потоковых редакторах (n8n,
// Node-RED, плагин BlueLine для Unreal): на пересечении сразу видно, что это
// две отдельные линии, а не развилка, и глаз ведёт связь по прямым участкам.
//
// Линии лежат в слое ПОД нодами, поэтому участок, попавший на тело ноды,
// исчезает — вместе с ним и место входа связи. Маршрут это учитывает:
// перебираются варианты разводки, побеждает самый короткий, который никого не
// задевает.

const R = 14            // радиус скругления углов
const STUB = 26         // прямой хвостик у портов, чтобы связь читалась у ноды
const PAD = 2           // запас вокруг тела ноды
const CLEAR = 26        // на сколько маршрут отходит от края ноды при обходе
const SHORT_LINK = 90   // совсем короткая связь — рисуем напрямую
const SAMPLE_STEP = 12  // шаг проверки пересечений вдоль сегмента

// ── Построение пути ──────────────────────────────────────────────────────

function round(v) { return Math.round(v * 10) / 10 }
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y) }

function towards(from, to, len) {
  const d = dist(from, to) || 1
  return { x: from.x + (to.x - from.x) * (len / d), y: from.y + (to.y - from.y) * (len / d) }
}

// Точки на одном месте ломают скругление — схлопываем
function dedupe(pts) {
  const out = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) out.push(p)
  }
  return out
}

// Ломаная → путь со скруглёнными углами. Радиус ужимается под короткие
// сегменты, поэтому мелкие ступеньки не превращаются в петли.
export function roundedPath(pts) {
  const p = dedupe(pts)
  if (p.length < 2) return ''
  let d = `M ${round(p[0].x)} ${round(p[0].y)}`
  for (let i = 1; i < p.length - 1; i++) {
    const prev = p[i - 1], cur = p[i], next = p[i + 1]
    const r = Math.max(2, Math.min(R, dist(prev, cur) / 2, dist(cur, next) / 2))
    const a = towards(cur, prev, r)
    const b = towards(cur, next, r)
    d += ` L ${round(a.x)} ${round(a.y)} Q ${round(cur.x)} ${round(cur.y)} ${round(b.x)} ${round(b.y)}`
  }
  const last = p[p.length - 1]
  return d + ` L ${round(last.x)} ${round(last.y)}`
}

// ── Проверка на пересечение с телами нод ─────────────────────────────────

function hitsBox(a, b, box) {
  const steps = Math.max(2, Math.ceil(dist(a, b) / SAMPLE_STEP))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    if (x > box.left - PAD && x < box.right + PAD &&
        y > box.top - PAD && y < box.bottom + PAD) return true
  }
  return false
}

// Сколько сегментов маршрута задевает тела нод. Куски у самых портов не в
// счёт: там линия и так идёт вплотную к своей ноде.
export function routeHits(pts, boxes, fromBox, toBox) {
  let n = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    for (const box of boxes) {
      if (box === fromBox && i === 0) continue
      if (box === toBox && i === pts.length - 2) continue
      if (hitsBox(a, b, box)) { n++; break }
    }
  }
  return n
}

export function routeLength(pts) {
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) len += dist(pts[i], pts[i + 1])
  return len
}

// ── Варианты разводки ────────────────────────────────────────────────────

// Цель правее источника — «ступенька»: вправо, вертикаль, вправо. Место
// перелома пробуем в разных долях пролёта, чтобы обойти то, что стоит между.
function stepRoutes(p0, p1) {
  return [0.5, 0.32, 0.68, 0.16, 0.84].map(f => {
    const midX = p0.x + (p1.x - p0.x) * f
    return [p0, { x: midX, y: p0.y }, { x: midX, y: p1.y }, p1]
  })
}

// Цель левее (связь «назад») — линия выходит вправо, идёт по свободной
// горизонтали и заходит в порт слева.
//
// Вариантов много намеренно: обходить обе ноды целиком нужно далеко не
// всегда. Если между ними есть просвет или цель стоит выше/ниже, короткий
// путь идёт рядом, а не вокруг всего. Негодные отсеет проверка пересечений,
// из оставшихся победит самый короткий.
function backRoutes(p0, p1, fromBox, toBox) {
  const fb = fromBox, tb = toBox
  const rights = uniq([
    Math.max(p0.x, fb?.right ?? p0.x) + STUB,
    Math.max(p0.x, fb?.right ?? p0.x, tb?.right ?? p0.x) + STUB,
  ])
  const lefts = uniq([
    Math.min(p1.x, tb?.left ?? p1.x) - STUB,
    Math.min(p1.x, tb?.left ?? p1.x, fb?.left ?? p1.x) - STUB,
  ])
  const lanes = uniq([
    // рядом с источником
    (fb?.bottom ?? p0.y) + CLEAR,
    (fb?.top ?? p0.y) - CLEAR,
    // рядом с целью
    (tb?.bottom ?? p1.y) + CLEAR,
    (tb?.top ?? p1.y) - CLEAR,
    // в просвете между нодами, если они не перекрываются по вертикали
    fb && tb && tb.top > fb.bottom ? (fb.bottom + tb.top) / 2 : null,
    fb && tb && fb.top > tb.bottom ? (tb.bottom + fb.top) / 2 : null,
    // вокруг обеих — запасной вариант, когда рядом не пройти
    Math.min(fb?.top ?? p0.y, tb?.top ?? p1.y) - CLEAR,
    Math.max(fb?.bottom ?? p0.y, tb?.bottom ?? p1.y) + CLEAR,
  ])

  const out = []
  for (const right of rights) {
    for (const left of lefts) {
      for (const lane of lanes) {
        out.push([
          p0,
          { x: right, y: p0.y },
          { x: right, y: lane },
          { x: left, y: lane },
          { x: left, y: p1.y },
          p1,
        ])
      }
    }
  }
  return out
}

function uniq(list) {
  return [...new Set(list.filter(v => v != null))]
}

// Обход по коридору сверху/снизу, когда «ступенька» упирается в ноду
function laneRoutes(p0, p1, boxes) {
  if (!boxes.length) return []
  const lanes = [
    Math.min(...boxes.map(b => b.top)) - CLEAR,
    Math.max(...boxes.map(b => b.bottom)) + CLEAR,
  ]
  const outX = p0.x + STUB
  const inX = p1.x - STUB
  return lanes.map(lane => ([
    p0,
    { x: outX, y: p0.y },
    { x: outX, y: lane },
    { x: inX, y: lane },
    { x: inX, y: p1.y },
    p1,
  ]))
}

// Путь связи. toBox — тело ноды-цели, obstacles — тела всех нод, fromBox —
// тело ноды-источника (под неё нырять тоже нельзя, кроме выхода из порта).
export function connectionPath(x1, y1, x2, y2, seed, toBox, obstacles = [], fromBox = null) {
  const p0 = { x: x1, y: y1 }
  const p1 = { x: x2, y: y2 }
  // «Назад» — только когда цель реально левее: у соседних нод порты почти
  // касаются, и там нужна короткая перемычка, а не обход по коридору
  const back = x2 < x1

  const direct = back
    ? backRoutes(p0, p1, fromBox, toBox)[0]
    : stepRoutes(p0, p1)[0]

  if (!toBox || !obstacles.length) return roundedPath(direct)
  if (!back && dist(p0, p1) < SHORT_LINK) return roundedPath(direct)

  // Сверяемся только с теми, кто вообще рядом с маршрутом
  const near = obstacles.filter(b =>
    b.right > Math.min(x1, x2) - 400 && b.left < Math.max(x1, x2) + 400 &&
    b.bottom > Math.min(y1, y2) - 600 && b.top < Math.max(y1, y2) + 600)

  const candidates = back
    ? backRoutes(p0, p1, fromBox, toBox)
    : [...stepRoutes(p0, p1), ...laneRoutes(p0, p1, near)]

  // Побеждает самый короткий чистый маршрут; если чистых нет — тот, что
  // задевает меньше всего
  let best = null
  for (const pts of candidates) {
    const hits = routeHits(pts, near, fromBox, toBox)
    const len = routeLength(pts)
    const better = !best
      || (hits < best.hits)
      || (hits === best.hits && len < best.len)
    if (better) best = { pts, hits, len }
  }
  return roundedPath(best?.pts ?? direct)
}
