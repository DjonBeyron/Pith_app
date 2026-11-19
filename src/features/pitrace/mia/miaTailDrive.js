import { MIA_TAIL } from './miaTailData.js'

// Хвост Мии, движение (владелец, v3.3.289: «мало кадров, хвост зависает, будто подрезан»). Раньше девять картинок по 160 мс переключал CSS (6 кадров/с, а «довольна» вообще замирала на одном кадре).
// Теперь девять ключевых поз (miaTailData.js: хребет хвоста + толщина) пересчитываются на КАЖДЫЙ кадр экрана: между позами — кубическая (Катмулл–Ром) интерполяция углов и длин звеньев хребта от основания
// (так хвост именно поворачивается, а не сжимается, как при смешивании точек), контур строится по хребту и толщине. «Довольна» (pl 0 → 1) смешивает позу с поднятой (CALM), замедляет ход и пушит хвост — но хвост не замирает.
// Чистые функции без DOM (тесты) + тонкий драйвер, который пишет d в узлы дерева (miaTailFrames.js). Часы — dt из rAF RaceMia: на паузе игры dt = 0.
export const KEYS = MIA_TAIL.length
export const CYCLE_MS = 1440          // полный цикл девяти поз (как было: 9 × 160 мс)
export const OUT_W = 4.87             // обводка хвоста, единицы пака (≈ 2,7 px гифки)
export const CALM = 3                 // поза «довольна»: хвост поднят
export const CALM_MIX = 0.7           // насколько «довольный» хвост приходит к позе CALM (остальное — прежнее движение, он не замирает)
export const FLUFF = 0.3              // на сколько толще «пушистый» хвост
export const CALM_SPEED = 0.55        // во сколько раз медленнее ходит «довольный» хвост
export const MARK_SLOTS = 4           // штрихов в позе не больше (два треугольника + две дуги)
const FADE_FROM = 0.25, FADE_TO = 0.45 // штрихи позы видны на |u − поза| < FADE_FROM и гаснут к FADE_TO (дальше их заменяют штрихи соседней позы)

const N = MIA_TAIL[0].q.length / 2
const KF = MIA_TAIL.map(f => {
  const th = [], len = []
  for (let j = 0; j < N - 1; j++) { const dx = f.q[2 * j + 2] - f.q[2 * j], dy = f.q[2 * j + 3] - f.q[2 * j + 1]; th.push(Math.atan2(dy, dx)); len.push(Math.hypot(dx, dy)) }
  const px = f.q.filter((_, i) => i % 2 === 0), py = f.q.filter((_, i) => i % 2 === 1) // точки хребта позы (к ним приклеены штрихи)
  return { bx: f.q[0], by: f.q[1], th, len, w: f.w, marks: f.marks, px, py }
})
const near = (a, ref) => ref + Math.atan2(Math.sin(a - ref), Math.cos(a - ref)) // угол a, ближайший к ref (без скачка на 2π)
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Поза хвоста в момент u (в позах, любое число: цикл KEYS), pl — «довольна» 0…1 → { x[N], y[N], th[N − 1], w } */
export function tailPose(u, pl = 0) {
  const k = ((Math.floor(u) % KEYS) + KEYS) % KEYS, a = u - Math.floor(u)
  const f0 = KF[(k + KEYS - 1) % KEYS], f1 = KF[k], f2 = KF[(k + 1) % KEYS], f3 = KF[(k + 2) % KEYS], calm = KF[CALM]
  let bx = cr(f0.bx, f1.bx, f2.bx, f3.bx, a), by = cr(f0.by, f1.by, f2.by, f3.by, a)
  let w = cr(f0.w, f1.w, f2.w, f3.w, a)
  const th = [], len = []
  for (let j = 0; j < N - 1; j++) {
    const t1 = f1.th[j], t2 = near(f2.th[j], t1), t0 = near(f0.th[j], t1), t3 = near(f3.th[j], t2)
    let t = cr(t0, t1, t2, t3, a), l = Math.max(0.5, cr(f0.len[j], f1.len[j], f2.len[j], f3.len[j], a))
    if (pl > 0) { const m = CALM_MIX * pl; t += (near(calm.th[j], t) - t) * m; l += (calm.len[j] - l) * m }
    th.push(t); len.push(l)
  }
  if (pl > 0) { const m = CALM_MIX * pl; bx += (calm.bx - bx) * m; by += (calm.by - by) * m; w += (calm.w - w) * m }
  const x = [bx], y = [by]
  for (let j = 0; j < N - 1; j++) { x.push(x[j] + len[j] * Math.cos(th[j])); y.push(y[j] + len[j] * Math.sin(th[j])) }
  return { x, y, th, w: w * (1 + FLUFF * pl) }
}

const r1 = v => Math.round(v * 10) / 10

/** Контур хвоста по хребту: смещение на половину толщины (за вычетом половины обводки — обводка рисуется stroke по контуру), круглый кончик, основание спрятано под телом */
export function tailPath(p) {
  const hw = (p.w - OUT_W) / 2, n = p.x.length, L = [], R = []
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), tx = p.x[i1] - p.x[i0], ty = p.y[i1] - p.y[i0], m = Math.hypot(tx, ty) || 1
    const nx = -ty / m, ny = tx / m
    L.push([p.x[i] + nx * hw, p.y[i] + ny * hw]); R.push([p.x[i] - nx * hw, p.y[i] - ny * hw])
  }
  const tip = p.th[p.th.length - 1], cx = p.x[n - 1], cy = p.y[n - 1], cap = []
  for (let s = 1; s < 8; s++) { const a = tip + Math.PI / 2 - (Math.PI * s) / 8; cap.push([cx + hw * Math.cos(a), cy + hw * Math.sin(a)]) }
  const pts = [...L, ...cap, ...R.reverse()]
  return `M${pts.map(q => `${r1(q[0])} ${r1(q[1])}`).join('L')}Z`
}

/** Штрихи позы kk для позы p в момент u: [{ i, d, transform, opacity }] — каждый штрих приклеен к своей точке хребта и ходит вместе с ней */
export function tailMarks(u, p, pl = 0) {
  const kk = ((Math.round(u) % KEYS) + KEYS) % KEYS, da = Math.abs(u - Math.round(u)), op = (1 - smooth(FADE_FROM, FADE_TO, da)) * (1 - Math.min(1, pl * 1.6))
  const f = KF[kk], out = []
  f.marks.forEach((m, i) => {
    const j = m.j, rot = ((p.th[j] - f.th[j]) * 180) / Math.PI, kx = f.px[j], ky = f.py[j]
    out.push({ i, d: m.d, transform: `translate(${r1(p.x[j])} ${r1(p.y[j])}) rotate(${r1(rot)}) translate(${r1(-kx)} ${r1(-ky)})`, opacity: op })
  })
  return out
}

/** Драйвер узлов: root — элемент Мии (внутри .mt-tail и четыре .mk). update(dt сек, довольна) — на каждом кадре экрана; на паузе игры dt = 0 */
export function createTailDriver(root, { reduced = false } = {}) {
  const body = root?.querySelector('.mt-tail'), mk = [...(root?.querySelectorAll('.mk') ?? [])]
  let phase = 0, pl = 0, shown = mk.map(() => '')
  return {
    update(dt, pleased) {
      if (!body) return
      pl += ((pleased ? 1 : 0) - pl) * Math.min(1, dt / 0.35)
      if (!reduced) phase += (dt * 1000 / CYCLE_MS) * KEYS * (1 - (1 - CALM_SPEED) * pl)
      const p = tailPose(phase, pl)
      body.setAttribute('d', tailPath(p))
      const ms = tailMarks(phase, p, pl)
      mk.forEach((el, i) => {
        const m = ms[i]
        if (!m || m.opacity < 0.01) { if (shown[i] !== '') { el.setAttribute('opacity', '0'); shown[i] = '' } return }
        if (shown[i] !== m.d) { el.setAttribute('d', m.d); shown[i] = m.d }
        el.setAttribute('transform', m.transform); el.setAttribute('opacity', String(r1(m.opacity * 100) / 100))
      })
    },
  }
}
