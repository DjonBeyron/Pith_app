import { orthPoints } from './ladderWires.js'

// Путь шарика как покадровая CSS-анимация transform: translate3d — вместо offset-path / offset-distance.
// offset-distance браузер анимирует только в главном потоке (каждый кадр — пересчёт стилей, слоёв и commit
// на каждый шарик), а transform идёт целиком на композиторе: главный поток свободен.
// Ключевые кадры берём так, чтобы движение было тем же, что у offset-distance под
// cubic-bezier(0.45, 0, 0.55, 1) на отрезке 0 → 74 % анимации: точки пути — через равные доли ПРОЙДЕННОГО
// расстояния (шаг STEP px, плюс сетка по времени), а время каждой точки — обратной функцией кривой (progress → time). Между кадрами
// интерполяция линейная (linear), поэтому ускорение/замедление уже «запечено» в положении кадров.
// Прозрачность и масштаб ядра/ореола остаются отдельными анимациями (memory-ladder.css).
export const BALL_EASE = [0.45, 0, 0.55, 1]
export const RUN_END = 74 // % анимации, к которому шарик добегает до шапки (дальше стоит и гаснет)
const TIME_STEPS = 60 // кадров по равным долям времени (см. ballTrack)
const STEP = 5 // px пути между соседними кадрами: на дуге угла (R=12) хорда отстаёт от кривой < 0.3 px

const bez = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3

// t, при котором координата кривой (a, b) равна target (кривая монотонна: a, b в [0, 1]) — бисекцией
function solve(target, a, b) {
  let lo = 0, hi = 1
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    if (bez(mid, a, b) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const [X1, Y1, X2, Y2] = BALL_EASE
// Какая доля пути пройдена к доле времени u (то, что считает offset-distance) и обратное — когда пройдена доля p
export const easeProgress = u => bez(solve(u, X1, X2), Y1, Y2)
export const easeTime = p => bez(solve(p, Y1, Y2), X1, X2)

// Точка на расстоянии d от начала ломаной
function pointAt(poly, cum, d) {
  let i = 1
  while (i < cum.length - 1 && cum[i] < d) i++
  const seg = cum[i] - cum[i - 1] || 1
  const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg))
  return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * t, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * t]
}

// pts — опорные точки пути шарика (ballPoints); → [{ at: % анимации, x, y }] от 0 % до RUN_END %.
// Кадры — объединение двух сеток: по равным долям расстояния (углы пути не срезаются) и по равным долям
// времени (там, где кривая почти стоит — у старта и финиша — 4-px шаг по расстоянию длился бы долго, и линейная
// интерполяция между кадрами отставала бы от кривой на ≈ 1 px)
export function ballTrack(pts) {
  const poly = orthPoints(pts, 12, 8)
  const cum = [0]
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]))
  const total = cum[cum.length - 1]
  const n = Math.max(2, Math.ceil(total / STEP))
  const samples = [] // { u: доля времени 0..1, p: доля пути 0..1 }
  for (let j = 0; j <= n; j++) samples.push({ u: easeTime(j / n), p: j / n })
  for (let k = 0; k <= TIME_STEPS; k++) samples.push({ u: k / TIME_STEPS, p: easeProgress(k / TIME_STEPS) })
  samples.sort((a, b) => a.u - b.u)
  const out = []
  for (const { u, p } of samples) {
    const last = u >= 1
    const at = last ? RUN_END : Math.round(RUN_END * u * 1000) / 1000
    if (out.length && out[out.length - 1].at >= at - 0.01) {
      if (!last) continue // кадры слиплись
      out.pop() // последний кадр всегда ровно RUN_END
    }
    const [x, y] = pointAt(poly, cum, p * total)
    out.push({ at, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
  }
  return out
}

// @keyframes name: translate3d по ballTrack; после RUN_END шарик стоит в конце (там он уже невидим — memBallRun)
export function ballKeyframes(name, pts) {
  const track = ballTrack(pts)
  const tf = ({ x, y }) => `transform:translate3d(${x}px,${y}px,0)`
  const frames = track.map((k, i) => `${i === track.length - 1 ? `${k.at}%,100%` : `${k.at}%`}{${tf(k)}}`)
  return `@keyframes ${name}{${frames.join('')}}`
}
