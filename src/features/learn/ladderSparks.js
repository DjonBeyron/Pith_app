// Искрение на оборванных концах кабеля (режим сна, ladderTear.js): чистые детерминированные данные для
// MemoryTearSparks.jsx. Без Math.random — формы одинаковы между рендерами: «шум» считается от индекса (noise).
// У каждого конца разрыва: два коротких зигзага-разряда (4–5 ломаных сегментов, свой угол и форма; мерцают по
// двум разным рисункам A / B), искра-звёздочка из 4 лучиков на кончике (вспыхивает вместе с первым разрядом),
// три «летящие» искорки-чёрточки (отлетают на 6–12 px по дуге: точка излома --mx/--my и конец --tx/--ty для
// CSS translate), плюс одна дуга-разряд через весь разрыв (редкая). Всё — только opacity/transform в CSS
// (memory-sparks.css), периоды и сдвиги (--p, --d) у каждого элемента свои и не кратны друг другу.
const r1 = x => Math.round(x * 10) / 10

// Детерминированный шум 0..1 по паре индексов
export const noise = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s) }

// Зигзаг-разряд от точки (x, y) в сторону dir (±1 по x, в разрыв), ось отклонена на ±0.7 рад, 4–5 сегментов по
// 2.5–4.5 px (всего 10–22 px) с боковым дрожанием ±1.5 px; последний сегмент почти прямой — кончик тонкий
export function boltPath(x, y, dir, seed) {
  const n = 4 + Math.floor(noise(seed, 1) * 2)
  const a = (noise(seed, 2) - 0.5) * 1.4
  const ux = dir * Math.cos(a), uy = Math.sin(a)
  let d = `M ${r1(x)} ${r1(y)}`, px = x, py = y
  for (let k = 1; k <= n; k++) {
    const len = 2.5 + noise(seed, 10 + k) * 2
    const side = (noise(seed, 20 + k) - 0.5) * 3 * (k < n ? 1 : 0.4)
    px += ux * len - uy * side
    py += uy * len + ux * side
    d += ` L ${r1(px)} ${r1(py)}`
  }
  return d
}

// Звёздочка: 4 лучика по 2–3 px из точки, углы со сдвигом по зерну
export function starPath(x, y, seed) {
  const a0 = noise(seed, 3) * Math.PI / 2
  return [0, 1, 2, 3].map(k => {
    const a = a0 + k * Math.PI / 2 + (noise(seed, 30 + k) - 0.5) * 0.5
    const L = 2 + noise(seed, 40 + k)
    return `M ${r1(x)} ${r1(y)} L ${r1(x + Math.cos(a) * L)} ${r1(y + Math.sin(a) * L)}`
  }).join(' ')
}

// Дуга-разряд через разрыв: зигзаг от правого конца к левому, 7–9 сегментов, дрожание ±2 px
export function arcPath(xr, xl, y, seed) {
  const n = 7 + Math.floor(noise(seed, 4) * 3)
  let d = `M ${r1(xr)} ${r1(y)}`
  for (let k = 1; k < n; k++) {
    const t = k / n
    d += ` L ${r1(xr + (xl - xr) * t)} ${r1(y + (noise(seed, 50 + k) - 0.5) * 4)}`
  }
  return d + ` L ${r1(xl)} ${r1(y)}`
}

// Тайминги (с): периоды не кратны друг другу — вспышки не совпадают; у части разрядов длинная пауза
const BOLT_T = [[3.7, 0.4, 'A'], [5.9, 2.2, 'B'], [4.6, 1.3, 'B'], [3.1, 3.6, 'A']]
const FLY_T = [[2.9, 0.2], [4.3, 1.7], [5.6, 3.1], [3.3, 0.9], [4.9, 2.6], [6.1, 4.0]]
const ARC_T = [8.5, 2.0]

// right / left — x концов разрыва, y — горизонталь. → { bolts, stars, flies, arc }
export function tearSparks(right, left, y) {
  const ends = [[right, -1], [left, 1]]
  const bolts = []
  const stars = []
  const flies = []
  ends.forEach(([x, dir], e) => {
    for (let j = 0; j < 2; j++) {
      const [period, delay, kind] = BOLT_T[e * 2 + j]
      bolts.push({ d: boltPath(x, y, dir, e * 2 + j + 1), period, delay, kind })
    }
    stars.push({ d: starPath(x, y, e + 7), period: BOLT_T[e * 2][0], delay: BOLT_T[e * 2][1] })
    for (let j = 0; j < 3; j++) {
      const seed = 11 + e * 3 + j
      const a = (noise(seed, 5) - 0.5) * 1.6 // угол вылета от оси в разрыв
      const R = 6 + noise(seed, 6) * 6 // дальность 6–12 px
      const ux = dir * Math.cos(a), uy = Math.sin(a)
      const bend = (noise(seed, 7) - 0.5) * 6 // изгиб дуги
      const [period, delay] = FLY_T[e * 3 + j]
      flies.push({
        x1: r1(x), y1: r1(y), x2: r1(x + ux * 2), y2: r1(y + uy * 2),
        mx: r1(ux * R * 0.5 - uy * bend), my: r1(uy * R * 0.5 + ux * bend), tx: r1(ux * R), ty: r1(uy * R),
        period, delay,
      })
    }
  })
  return { bolts, stars, flies, arc: { d: arcPath(right, left, y, 9), period: ARC_T[0], delay: ARC_T[1] } }
}
