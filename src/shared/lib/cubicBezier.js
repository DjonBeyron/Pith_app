// cubic-bezier(x1, y1, x2, y2) → функция t ∈ [0..1] → прогресс, та же кривая,
// что браузер считает для CSS/WAAPI easing. Нужна, когда одна анимация должна
// повторять ДРУГУЮ не целиком, а кусочно (история чата едет за панелью только
// после касания, panelRise.js): такое одной CSS-кривой не задать, зато можно
// насэмплировать в keyframes с linear между точками.
//
// Стандартный приём: x(s) монотонна, ищем s по x (Ньютон + бисекция как
// страховка), затем берём y(s).
export function cubicBezier(x1, y1, x2, y2) {
  const A = (a1, a2) => 1 - 3 * a2 + 3 * a1
  const B = (a1, a2) => 3 * a2 - 6 * a1
  const C = a1 => 3 * a1
  const calc = (s, a1, a2) => ((A(a1, a2) * s + B(a1, a2)) * s + C(a1)) * s
  const slope = (s, a1, a2) => 3 * A(a1, a2) * s * s + 2 * B(a1, a2) * s + C(a1)

  function solveS(x) {
    let s = x
    for (let i = 0; i < 8; i++) {
      const d = slope(s, x1, x2)
      if (Math.abs(d) < 1e-6) break
      const err = calc(s, x1, x2) - x
      if (Math.abs(err) < 1e-6) return s
      s -= err / d
    }
    // Бисекция, если Ньютон ушёл в сторону
    let lo = 0, hi = 1
    s = x
    while (hi - lo > 1e-6) {
      const cx = calc(s, x1, x2)
      if (cx < x) lo = s; else hi = s
      s = (lo + hi) / 2
    }
    return s
  }

  return t => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    return calc(solveS(t), y1, y2)
  }
}

// Разбор строки вида 'cubic-bezier(0.22, 1, 0.36, 1)' → функция прогресса
export function easingFn(css) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css)
  if (!m) return t => t
  const [x1, y1, x2, y2] = m[1].split(',').map(Number)
  return cubicBezier(x1, y1, x2, y2)
}
