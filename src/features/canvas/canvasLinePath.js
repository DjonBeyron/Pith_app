// Геометрия линий между нодами. Линии лежат в слое ПОД нодами, поэтому
// участок, попавший на тело ноды, исчезает — вместе с ним и место входа связи.
//
// Форма всегда одна и та же — кубическая кривая, как было изначально: у неё
// нет изломов в принципе. Если кривая ныряет под ноду, подбирается другая
// пара касательных: куда линия выходит из порта и с какой стороны заходит в
// следующий. Перебор идёт от привычных форм к смелым, побеждает самый
// короткий чистый вариант — линия огибает ноду, оставаясь плавной.

const SAMPLES  = 26    // точек кривой для проверки пересечений
const PAD      = 2     // запас вокруг тела ноды: только само тело, без полей —
                       // иначе линия в узком зазоре между соседними нодами
                       // считалась «ныряющей» и уходила в бессмысленный крюк
// Прямая связь короче этого — обход не нужен: ноды стоят рядом, линия и так
// вся на виду
const SHORT_LINK = 90
// Насколько обход вправе быть длиннее прямой линии. Выше потолка петля
// становится нечитаемой — лучше оставить короткую линию как есть
const MAX_DETOUR = 2.5

// Обход задаётся касательными: в какую сторону линия выходит из порта и с
// какой стороны заходит в следующий, и как далеко тянется эта касательная.
// Так выражается любой разумный объезд — дуга, буква S, спуск по коридору
// между нодами. Смещать заранее заданную форму по одной оси, как раньше, для
// последнего случая просто не хватало.
const K = 0.7071
const DIRS8 = [
  [1, 0], [K, K], [0, 1], [-K, K],
  [-1, 0], [-K, -K], [0, -1], [K, -K],
]
// Длина касательной — доля расстояния между портами, а не фиксированные
// пиксели: форма кривой должна масштабироваться со связью, иначе для длинных
// связей нужные варианты оказываются в самом конце очереди перебора.
const FACTORS = [0.22, 0.4, 0.65, 1.0]
// Грубее по длине, зато все направления — второй проход для тесных мест
const FACTORS_WIDE = [0.4, 0.7, 1.0]

function build(dirs1, dirs2, factors) {
  return factors
    .flatMap(f1 => factors.flatMap(f2 =>
      dirs1.flatMap(d1 => dirs2.map(d2 => ({
        f1, f2, d1, d2,
        cost: (f1 + f2) * 220 + (1 - d1[0]) * 240 + (1 + d2[0]) * 240,
      })))))
    .sort((a, b) => a.cost - b.cost)
}

// Привычный вид связи: из порта вправо, в следующий порт слева. Первый проход
// перебирает только такие формы — этого хватает почти всегда. Второй нужен
// для тесных расстановок, где выйти приходится вниз, а зайти сверху: там
// линия идёт по коридору между нодами.
const RIGHTISH = DIRS8.filter(d => d[0] > 0.5)
const LEFTISH = DIRS8.filter(d => d[0] < -0.5)
const VARIANTS_MAIN = build(RIGHTISH, LEFTISH, FACTORS)
const VARIANTS_WIDE = build(DIRS8, DIRS8, FACTORS_WIDE)

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
// skipNear — радиус вокруг порта, в котором касание не в счёт. Считаем именно
// в пикселях, а не «первые N сэмплов»: у длинной кривой три сэмпла — это
// десятки пикселей пути, и заход под ноду на подлёте оставался незамеченным.
function hits(ctrl, boxes, skipStart = 0, skipEnd = 0, stopAtFirst = false) {
  const p0 = ctrl[0], p1 = ctrl[3]
  let n = 0
  for (let i = 1; i < SAMPLES; i++) {
    if (stopAtFirst && n) break
    const pt = cubicAt(ctrl, i / SAMPLES)
    if (skipStart && Math.hypot(pt.x - p0.x, pt.y - p0.y) < skipStart) continue
    if (skipEnd && Math.hypot(pt.x - p1.x, pt.y - p1.y) < skipEnd) continue
    for (const b of boxes) {
      if (pt.x > b.left - PAD && pt.x < b.right + PAD &&
          pt.y > b.top - PAD  && pt.y < b.bottom + PAD) { n++; break }
    }
  }
  return n
}

// Полная оценка варианта. Цель и источник проверяются не целиком: у портов
// линия идёт вплотную к краю своей ноды, это не «нырок». Но уже со второго
// сэмпла заезд под источник считается — именно так линия и уходила назад
// под собственную ноду, вылезая с другой стороны.
const PORT_SKIP = 26

// quick — нужно только «чисто/не чисто»: считать все касания незачем, а
// перебор вариантов на большом графе идёт тысячами вызовов
function scoreCtrl(ctrl, toBox, others, fromBox, quick = false) {
  let n = hits(ctrl, [toBox], 0, PORT_SKIP, quick)
  if (quick && n) return n
  if (fromBox) {
    n += hits(ctrl, [fromBox], PORT_SKIP, 0, quick)
    if (quick && n) return n
  }
  if (others.length) n += hits(ctrl, others, 0, 0, quick)
  return n
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
const MAX_TRIES = 140

function toD(p) {
  return `M ${p[0].x} ${p[0].y} C ${p[1].x} ${p[1].y}, ${p[2].x} ${p[2].y}, ${p[3].x} ${p[3].y}`
}

// Исходная органическая кривая: короткая S вперёд либо петля вправо назад
function neuronCtrl(x1, y1, x2, y2, seed) {
  const dx = x2 - x1, dy = y2 - y1
  const jit = (s, m) => (seededRand(s) - 0.5) * m
  const back = x2 <= x1 - 240

  if (!back) {
    // Вынос контрольных точек: линия выходит из порта горизонтально. Минимум
    // 40px хорош на обычных дистанциях, но когда ноды стоят вплотную и между
    // портами считаные пиксели, он длиннее самого пролёта — кривая
    // складывается сама в себя и выглядит петлёй. Ограничиваем половиной
    // расстояния.
    const adx = Math.abs(dx)
    const h = Math.max(Math.min(40, adx * 0.5), adx * 0.4, 8)
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

// Кривая по касательным: выходит из порта в сторону d1 на r1, входит в
// следующий порт со стороны d2 с расстояния r2
function tangentCtrl(p0, p1, { f1, f2, d1, d2 }, dist) {
  const r1 = f1 * dist, r2 = f2 * dist
  return [
    p0,
    { x: p0.x + d1[0] * r1, y: p0.y + d1[1] * r1 },
    { x: p1.x + d2[0] * r2, y: p1.y + d2[1] * r2 },
    p1,
  ]
}

// Путь связи. toBox — тело ноды-цели, obstacles — тела всех нод, кроме
// источника (цель входит в список: под неё нырять тоже нельзя).
export function connectionPath(x1, y1, x2, y2, seed, toBox, obstacles = [], fromBox = null) {
  const base = neuronCtrl(x1, y1, x2, y2, seed)
  if (!toBox || !obstacles.length) return toD(base)

  // Соседние ноды: порты почти касаются, линия короткая и целиком видна —
  // обходить нечего
  if (Math.hypot(x2 - x1, y2 - y1) < SHORT_LINK) return toD(base)

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
    if (b.right + PAD < bLo.x || b.left - PAD > bHi.x) continue
    if (b.bottom + PAD < bLo.y || b.top - PAD > bHi.y) continue
    touching.push(b)
  }
  if (!touching.length) return toD(base)

  const baseClean = scoreCtrl(base, toBox, touching.filter(b => b !== toBox && b !== fromBox), fromBox, true) === 0
  if (baseClean) return toD(base)

  // Дальше идёт перебор вариантов — только для реально мешающих соседей
  const loX = Math.min(x1, x2) - 260, hiX = Math.max(x1, x2) + 900
  const loY = Math.min(y1, y2) - 900, hiY = Math.max(y1, y2) + 900
  const near = obstacles.filter(b =>
    b.right > loX && b.left < hiX && b.bottom > loY && b.top < hiY)
  const others = near.filter(b => b !== toBox && b !== fromBox)

  // Среди вариантов, никого не задевающих, берётся САМЫЙ КОРОТКИЙ из тех,
  // что не заламываются: линия идёт впритирку к ноде, а у входа сохраняет
  // живой изгиб. Широкая дуга через пол-холста проигрывает по длине. Нет
  // чистых (ноды вплотную) — тот, что задевает меньше; все с заломом —
  // самый спокойный.
  const baseLen = measure(base).length
  let best = base, bestLen = Infinity, bestCurve = Infinity, found = false
  let clean = null
  // Кандидаты идут от привычных форм к смелым, поэтому после первого
  // подходящего смотрим ещё немного и останавливаемся: дальше маршруты
  // только длиннее, а перебор целиком стоит заметного времени
  let left = Infinity
  let budget = MAX_TRIES
  const dist = Math.hypot(x2 - x1, y2 - y1)
  for (const variant of VARIANTS_MAIN.concat(VARIANTS_WIDE)) {
    if (left-- <= 0 || budget <= 0) break
    budget--
    const ctrl = tangentCtrl(base[0], base[3], variant, dist)
    const n = scoreCtrl(ctrl, toBox, others, fromBox, true)
    if (n > 0) continue
    const { length, curve } = measure(ctrl)
    // Первый чистый вариант запоминаем всегда — даже если он длиннее
    // разумного. Пусть лучше длинная линия, чем нырок под ноду: если в
    // пределах лимита ничего не найдётся, возьмём его.
    if (!clean) clean = ctrl
    // Крюк во много раз длиннее прямой читается хуже, чем сама прямая
    if (length > baseLen * MAX_DETOUR) continue
    if (curve <= MAX_CURVE) {
      if (!found || length < bestLen) { bestLen = length; best = ctrl; found = true }
      if (left === Infinity) left = 10
    } else if (!found && curve < bestCurve) {
      bestCurve = curve; best = ctrl
    }
  }
  // Ничего в пределах лимитов, но чистый вариант был — он лучше короткой
  // линии, ныряющей под ноду. Совсем ничего — остаётся привычная форма.
  if (!found && bestCurve === Infinity && clean) return toD(clean)
  return toD(best)
}
