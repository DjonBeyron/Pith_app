// Геометрия линий между нодами. Линии лежат в слое ПОД нодами, поэтому
// участок, попавший на тело ноды, исчезает — вместе с ним и место входа связи.
//
// Форма всегда одна и та же — кубическая кривая, как было изначально: у неё
// нет изломов в принципе. Если кривая ныряет под ноду, меняется не форма, а
// прогиб: контрольные точки отводятся выше или ниже (а у связей «назад» ещё
// и заход к порту переносится влево), пока путь не перестанет задевать тела
// нод. Получается та же плавная линия, просто обогнувшая препятствие.

const SAMPLES  = 26    // точек кривой для проверки пересечений
const PAD      = 8     // запас вокруг тела ноды
const APPROACH = 70    // насколько левее точки входа уводится заход в порт
// Ступени прогиба: пробуем от лёгкого отклонения к широкой дуге
const LIFTS = [40, 70, 110, 160, 220, 300, 400, 520, 660]
// Растяжение контрольных точек по горизонтали — на случай препятствия
// вплотную к порту, когда одного вертикального прогиба мало
const SPREADS = [1, 1.7, 2.6]

// Все сочетания, отсортированные по силе искажения: растяжение меняет форму
// заметнее подъёма, поэтому в цене оно дороже
const VARIANTS = LIFTS
  .flatMap(lift => SPREADS.map(spread => ({ lift, spread, cost: lift + (spread - 1) * 260 })))
  .sort((a, b) => a.cost - b.cost)

function seededRand(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(Math.sin(h) * 43758.5453) % 1
}

function cubicAt(p, t) {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return {
    x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
    y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
  }
}

// Сколько сэмплов кривой попало в тела нод. Для ноды-цели крайние сэмплы не
// в счёт: линия подходит к её порту вплотную к краю, это не «нырок». Для
// чужих нод проверяется вся длина — там задевать нельзя нигде.
function hits(ctrl, boxes, from, to) {
  let n = 0
  for (let i = from; i <= to; i++) {
    const pt = cubicAt(ctrl, i / SAMPLES)
    for (const b of boxes) {
      if (pt.x > b.left - PAD && pt.x < b.right + PAD &&
          pt.y > b.top - PAD  && pt.y < b.bottom + PAD) { n++; break }
    }
  }
  return n
}

// Полная оценка варианта: цель — без крайних сэмплов, остальные — целиком
function scoreCtrl(ctrl, toBox, others) {
  return hits(ctrl, [toBox], 3, SAMPLES - 3) +
    (others.length ? hits(ctrl, others, 1, SAMPLES - 1) : 0)
}

// Длина кривой и её самый крутой поворот (радиан на пиксель). Кривизна
// нормирована по длине, поэтому сравнима у вариантов разного размера:
// 0.06 ≈ поворот радиусом 17px — заметный изгиб, но ещё не залом.
function measure(ctrl) {
  let prev = null, curve = 0, length = 0
  let a = cubicAt(ctrl, 0)
  for (let i = 1; i <= SAMPLES; i++) {
    const b = cubicAt(ctrl, i / SAMPLES)
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    length += len
    if (len > 0.5) {
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
      if (prev) {
        const cos = Math.min(1, Math.max(-1, prev.x * dir.x + prev.y * dir.y))
        curve = Math.max(curve, Math.acos(cos) / len)
      }
      prev = dir
    }
    a = b
  }
  return { length, curve }
}

const MAX_CURVE = 0.06
// Потолок перебора на одну связь: если за столько попыток чистый маршрут не
// нашёлся, ноды стоят слишком тесно — дальше перебирать бессмысленно, а на
// большом графе это заметное время каждого пересчёта
const MAX_TRIES = 22

function toD(p) {
  return `M ${p[0].x} ${p[0].y} C ${p[1].x} ${p[1].y}, ${p[2].x} ${p[2].y}, ${p[3].x} ${p[3].y}`
}

// Исходная органическая кривая: короткая S вперёд либо петля вправо назад
function neuronCtrl(x1, y1, x2, y2, seed) {
  const dx = x2 - x1, dy = y2 - y1
  const jit = (s, m) => (seededRand(s) - 0.5) * m
  const back = x2 <= x1 - 240

  if (!back) {
    const h = Math.max(Math.abs(dx) * 0.4, 40)
    return [
      { x: x1, y: y1 },
      { x: x1 + h + jit(seed + 'a', 10), y: y1 + dy * 0.3 + jit(seed + 'b', 8) },
      { x: x2 - h + jit(seed + 'c', 10), y: y2 - dy * 0.3 + jit(seed + 'd', 8) },
      { x: x2, y: y2 },
    ]
  }

  const dist = Math.sqrt(dx * dx + dy * dy)
  const bulge = Math.max(dist * 0.5, 100)
  return [
    { x: x1, y: y1 },
    { x: x1 + bulge + jit(seed + 'a', 12), y: y1 + dy * 0.15 + jit(seed + 'b', 8) },
    { x: x2 + bulge + jit(seed + 'c', 12), y: y2 - dy * 0.15 + jit(seed + 'd', 8) },
    { x: x2, y: y2 },
  ]
}

// Та же кривая, но отведённая от препятствия: обе контрольные точки уходят
// вверх или вниз на lift, а spread растягивает их по горизонтали (дуга шире
// и обходит то, что стоит вплотную к порту). У связи «назад» вторая точка
// вдобавок переносится левее входа — иначе линия приходит в порт сквозь тело
// своей же ноды.
function liftedCtrl(base, lift, up, back, x1, x2, spread) {
  const dy = up ? -lift : lift
  const c1 = { x: x1 + (base[1].x - x1) * spread, y: base[1].y + dy }
  const c2 = back
    ? { x: x2 - APPROACH * spread, y: base[3].y + dy }
    : { x: x2 - (x2 - base[2].x) * spread, y: base[2].y + dy }
  return [base[0], c1, c2, base[3]]
}

// Путь связи. toBox — тело ноды-цели, obstacles — тела всех нод, кроме
// источника (цель входит в список: под неё нырять тоже нельзя).
export function connectionPath(x1, y1, x2, y2, seed, toBox, obstacles = [], fromBox = null) {
  const base = neuronCtrl(x1, y1, x2, y2, seed)
  if (!toBox || !obstacles.length) return toD(base)

  // Быстрая отбраковка: кривая Безье целиком лежит в оболочке своих
  // контрольных точек, поэтому бокс вне этого прямоугольника задеть нельзя.
  // Подавляющее большинство связей ни с кем не пересекается и уходит отсюда,
  // сверившись с одним-двумя соседями, а не со всем графом.
  let bLo = { x: Infinity, y: Infinity }, bHi = { x: -Infinity, y: -Infinity }
  for (const p of base) {
    if (p.x < bLo.x) bLo.x = p.x
    if (p.y < bLo.y) bLo.y = p.y
    if (p.x > bHi.x) bHi.x = p.x
    if (p.y > bHi.y) bHi.y = p.y
  }
  const touching = []
  for (const b of obstacles) {
    if (b === fromBox) continue
    if (b.right + PAD < bLo.x || b.left - PAD > bHi.x) continue
    if (b.bottom + PAD < bLo.y || b.top - PAD > bHi.y) continue
    touching.push(b)
  }
  if (!touching.length) return toD(base)

  let bestHits = scoreCtrl(base, toBox, touching.filter(b => b !== toBox))
  if (bestHits === 0) return toD(base)

  // Дальше идёт перебор вариантов — только для реально мешающих соседей
  const loX = Math.min(x1, x2) - 260, hiX = Math.max(x1, x2) + 900
  const loY = Math.min(y1, y2) - 900, hiY = Math.max(y1, y2) + 900
  const near = obstacles.filter(b => b !== fromBox &&
    b.right > loX && b.left < hiX && b.bottom > loY && b.top < hiY)
  const others = near.filter(b => b !== toBox)

  const back = x2 <= x1 - 240
  // Первой пробуем сторону, к которой линия и так ближе — крюк меньше
  const mid = (toBox.top + toBox.bottom) / 2
  const sides = Math.min(y1, y2) <= mid ? [true, false] : [false, true]

  // Среди вариантов, никого не задевающих, берётся САМЫЙ КОРОТКИЙ из тех,
  // что не заламываются: линия идёт впритирку к ноде, а у входа сохраняет
  // живой изгиб. Широкая дуга через пол-холста проигрывает по длине. Нет
  // чистых (ноды вплотную) — тот, что задевает меньше; все с заломом —
  // самый спокойный.
  let best = base, bestLen = Infinity, bestCurve = Infinity, found = false
  // Кандидаты идут от слабого искажения к сильному, поэтому после первого
  // подходящего смотрим ещё несколько и останавливаемся: дальше маршруты
  // только длиннее, а перебор всех вариантов стоит заметного времени
  let left = Infinity
  let budget = MAX_TRIES
  for (const { lift, spread } of VARIANTS) {
    if (left-- <= 0 || budget <= 0) break
    for (const up of sides) {
      budget--
      const ctrl = liftedCtrl(base, lift, up, back, x1, x2, spread)
      const n = scoreCtrl(ctrl, toBox, others)
      if (n > 0) {
        if (!found && bestCurve === Infinity && n < bestHits) { bestHits = n; best = ctrl }
        continue
      }
      const { length, curve } = measure(ctrl)
      if (curve <= MAX_CURVE) {
        if (!found || length < bestLen) { bestLen = length; best = ctrl; found = true }
        if (left === Infinity) left = 3
      } else if (!found && curve < bestCurve) {
        bestCurve = curve; best = ctrl
      }
    }
  }
  return toD(best)
}
