// Хвост кота: цепочка сегментов (кинематика), одна трубка с обводкой и полосками. Основание P0 закреплено под бедром и закрыто телом —
// оторваться не может. Изгиб идёт от основания к кончику (бегущая волна), как у настоящего кота. Чистая математика, без DOM.
// Профили хвоста: точки покоя (основание → кончик) и ширина в каждой точке. girl — тоньше, длиннее, плавный S-изгиб и мягкий завиток на конце
const PROFILES = {
  boy: { REST: [[428, 652], [470, 654], [508, 646], [540, 626], [556, 600], [556, 572], [542, 550], [524, 540]], WIDTHS: [74, 74, 72, 70, 66, 62, 58, 52] },
  girl: { REST: [[428, 654], [468, 674], [506, 680], [540, 668], [562, 642], [570, 610], [564, 578], [550, 554], [532, 544]], WIDTHS: [58, 58, 56, 53, 50, 46, 42, 38, 34], STRIPES: [], TIP_FROM: 0.64 },   // без полосок: однотонный хвост с карамельным кончиком
}
let REST, WIDTHS, SEG, N
let STRIPES, TIP_FROM   // доли длины: тёмные поперечные полоски и начало тёмного кончика (из профиля)
export function useTailProfile(name = 'boy') {
  const P = PROFILES[name]; REST = P.REST; WIDTHS = P.WIDTHS; STRIPES = P.STRIPES || [[0.27, 0.35], [0.47, 0.55], [0.67, 0.75]]; TIP_FROM = P.TIP_FROM || 0.9
  SEG = REST.slice(1).map((p, i) => ({ len: Math.hypot(p[0] - REST[i][0], p[1] - REST[i][1]), ang: Math.atan2(p[1] - REST[i][1], p[0] - REST[i][0]) }))
  N = SEG.length
}
useTailProfile('boy')
const PER = 4                       // выборок на сегмент
export const TAIL_COLORS = { fill: '#bc82fa', stripe: '#9656e0', line: '#582e99', lineW: 7 }
const f1 = v => (Math.round(v * 10) / 10).toString()

function chain(theta) {
  const pts = [REST[0].slice()]
  let cum = 0
  for (let i = 0; i < N; i++) {
    cum += theta[i] || 0
    const a = SEG[i].ang + cum
    pts.push([pts[i][0] + SEG[i].len * Math.cos(a), pts[i][1] + SEG[i].len * Math.sin(a)])
  }
  return pts
}
function crPoint(p0, p1, p2, p3, u) {   // Catmull-Rom
  const u2 = u * u, u3 = u2 * u
  return [0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3))
}
function dense(pts) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)]
    for (let k = 0; k < PER; k++) {
      const u = k / PER
      out.push({ p: crPoint(a, b, c, d, u), w: WIDTHS[i] + (WIDTHS[i + 1] - WIDTHS[i]) * u })
    }
  }
  out.push({ p: pts[pts.length - 1].slice(), w: WIDTHS[WIDTHS.length - 1] })
  return out
}
export function tailGeometry(theta) {
  const c = dense(chain(theta))
  const L = [], R = []
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)].p, b = c[Math.min(c.length - 1, i + 1)].p
    let tx = b[0] - a[0], ty = b[1] - a[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m
    const nx = -ty, ny = tx, h = c[i].w / 2
    L.push([c[i].p[0] + nx * h, c[i].p[1] + ny * h]); R.push([c[i].p[0] - nx * h, c[i].p[1] - ny * h])
    c[i].t = [tx, ty]; c[i].n = [nx, ny]
  }
  // скруглённый кончик: дуга от левого края через направление хвоста к правому
  const last = c[c.length - 1], r = last.w / 2, cap = []
  for (let k = 1; k < 8; k++) { const al = Math.PI * k / 8; cap.push([last.p[0] + last.n[0] * Math.cos(al) * r + last.t[0] * Math.sin(al) * r, last.p[1] + last.n[1] * Math.cos(al) * r + last.t[1] * Math.sin(al) * r]) }
  const P = pts => pts.map(q => `${f1(q[0])} ${f1(q[1])}`).join('L')
  const body = `M${P(L)}L${P(cap)}L${P(R.slice().reverse())}Z`
  const n = c.length
  // полоски и тёмный кончик лежат поверх заливки и обводки, поэтому отступают внутрь на полширины обводки — иначе закрыли бы её внутреннюю половину
  const IN = TAIL_COLORS.lineW / 2 - 0.2
  const Li = [], Ri = []
  for (let i = 0; i < n; i++) { const h = Math.max(1, c[i].w / 2 - IN); Li.push([c[i].p[0] + c[i].n[0] * h, c[i].p[1] + c[i].n[1] * h]); Ri.push([c[i].p[0] - c[i].n[0] * h, c[i].p[1] - c[i].n[1] * h]) }
  const band = (a, b) => { const i0 = Math.round(a * (n - 1)), i1 = Math.round(b * (n - 1)); return `M${P(Li.slice(i0, i1 + 1))}L${P(Ri.slice(i0, i1 + 1).reverse())}Z` }
  const tipI = Math.round(TIP_FROM * (n - 1)), rr = Math.max(1, r - IN), capI = []
  for (let k = 1; k < 8; k++) { const al = Math.PI * k / 8; capI.push([last.p[0] + last.n[0] * Math.cos(al) * rr + last.t[0] * Math.sin(al) * rr, last.p[1] + last.n[1] * Math.cos(al) * rr + last.t[1] * Math.sin(al) * rr]) }
  const tip = `M${P(Li.slice(tipI))}L${P(capI)}L${P(Ri.slice(tipI).reverse())}Z`
  // два узла вместо шести: контур (заливка+обводка) и все полоски одним путём
  return { body, stripes: STRIPES.map(([a, b]) => band(a, b)).join('') + tip }
}
// Разметка хвоста в позе покоя (для статичного SVG и листов)
export function tailMarkup(theta = new Array(N).fill(0)) {
  const g = tailGeometry(theta), C = TAIL_COLORS
  return `<g class="tail"><path class="tl-fill" d="${g.body}" fill="${C.fill}" stroke="${C.line}" stroke-width="${C.lineW}" stroke-linejoin="round"/><path class="tl-s" d="${g.stripes}" fill="${C.stripe}"/></g>`
}
// Углы изгиба суставов во времени. talk 0…1 — насколько кот «увлечён» речью; kicks — недавние подёргивания [{t0, sign}]; phase — сдвиг, чтобы коты не вилялись синхронно
export function tailTheta(t, { talk = 0, kicks = [], phase = 0 } = {}) {
  const th = new Array(N).fill(0)
  const wi = 2 * Math.PI / 3.1, wt = 2 * Math.PI * 2.3
  for (let k = 0; k < N; k++) {
    const g = k / (N - 1)
    const idle = (0.012 + 0.10 * g) * Math.sin(wi * t - 0.55 * k + phase) + 0.05 * g * Math.sin(2 * Math.PI * t / 5.3 + phase)
    const hot = (0.025 + 0.15 * g) * Math.sin(wt * t - 0.7 * k + phase) - 0.05 * g
    th[k] = idle * (1 - talk) + hot * talk
    for (const kk of kicks) {
      const s = t - kk.t0 - 0.035 * k
      if (s > 0 && s < 0.9) th[k] += kk.sign * 0.26 * g * Math.exp(-s / 0.15) * (1 - Math.exp(-s / 0.02))
    }
  }
  return th
}
