// Пушистость серой кошки (концепт): пряди шерсти — заострённые «локоны» по контуру щёк, подбородка и хвоста, воротник на груди, шерсть в ушах и короткие штрихи-текстура.
// Контур берётся из готовых путей спрайта (точки по длине кривой), пряди садятся на край, наружу и вниз, поэтому силуэт получается лохматым.
// Использование: concept_gray.mjs подставляет прядям цвета палитры. Здесь только геометрия.

// ── точки вдоль абсолютного пути (M L C Q H V Z) ──
export function samplePath(d, step = 2) {
  const tok = d.match(/[MLCQHVZ]|-?\d*\.?\d+(?:e-?\d+)?/g); const pts = []
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0
  const num = () => parseFloat(tok[i++])
  const seg = (f, len) => { const n = Math.max(1, Math.ceil(len / step)); for (let k = 1; k <= n; k++) pts.push(f(k / n)) }
  while (i < tok.length) {
    if (/[A-Z]/.test(tok[i])) cmd = tok[i++]
    if (cmd === 'Z') { seg(t => [cx + (sx - cx) * t, cy + (sy - cy) * t], Math.hypot(sx - cx, sy - cy)); cx = sx; cy = sy; continue }
    if (cmd === 'M') { cx = sx = num(); cy = sy = num(); pts.push([cx, cy]); cmd = 'L'; continue }
    if (cmd === 'H') { const x = num(); const a = cx; seg(t => [a + (x - a) * t, cy], Math.abs(x - a)); cx = x; continue }
    if (cmd === 'V') { const y = num(); const a = cy; seg(t => [cx, a + (y - a) * t], Math.abs(y - a)); cy = y; continue }
    if (cmd === 'L') { const x = num(), y = num(); const a = cx, b = cy; seg(t => [a + (x - a) * t, b + (y - b) * t], Math.hypot(x - a, y - b)); cx = x; cy = y; continue }
    if (cmd === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num(); const a = cx, b = cy
      seg(t => { const u = 1 - t; return [u ** 3 * a + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x, u ** 3 * b + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y] }, Math.hypot(x - a, y - b) * 1.3)
      cx = x; cy = y; continue
    }
    if (cmd === 'Q') {
      const x1 = num(), y1 = num(), x = num(), y = num(); const a = cx, b = cy
      seg(t => { const u = 1 - t; return [u * u * a + 2 * u * t * x1 + t * t * x, u * u * b + 2 * u * t * y1 + t * t * y] }, Math.hypot(x - a, y - b) * 1.2)
      cx = x; cy = y; continue
    }
    i++
  }
  return pts
}

const inside = (poly, [x, y]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c
  }
  return c
}

// детерминированный «случай»: картинка не меняется от запуска к запуску
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296

// Локон: основание на краю (чуть заходит внутрь, чтобы закрыть контур), кончик наружу и вниз. Две кривые бока + заливка отдельно от обводки (основание без линии)
export function lock([px, py], [nx, ny], { len, w, sweep = 0.55, fill, ol, sw = 6, side = 1 }) {
  const tx = -ny, ty = nx                                     // касательная
  const bx1 = px - tx * w / 2 - nx * 5, by1 = py - ty * w / 2 - ny * 5
  const bx2 = px + tx * w / 2 - nx * 5, by2 = py + ty * w / 2 - ny * 5
  const dx = nx * (1 - sweep) , dy = ny * (1 - sweep) + sweep                       // направление кончика: наружу, но вниз
  const m = Math.hypot(dx, dy), tipx = px + dx / m * len, tipy = py + dy / m * len
  const c1x = px - tx * w * .55 + dx / m * len * .45, c1y = py - ty * w * .55 + dy / m * len * .45
  const c2x = px + tx * w * .45 + dx / m * len * .55, c2y = py + ty * w * .45 + dy / m * len * .55
  const f = n => n.toFixed(1)
  const sides = `M${f(px - tx * w / 2)} ${f(py - ty * w / 2)}Q${f(c1x)} ${f(c1y)} ${f(tipx)} ${f(tipy)}Q${f(c2x)} ${f(c2y)} ${f(px + tx * w / 2)} ${f(py + ty * w / 2)}`
  return `<path d="M${f(bx1)} ${f(by1)}L${sides.slice(1)}L${f(bx2)} ${f(by2)}Z" fill="${fill}"/>` +
    `<path d="${sides}" fill="none" stroke="${ol}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
}

// Пряди по контуру: берём точки с шагом gap, оставляем те, что подходят под filter(x, y), нормаль — в сторону от внутренности контура
export function edgeLocks(d, { gap, filter, len, w, sweep, fill, ol, sw, seed = 1, jitter = .35 }) {
  const pts = samplePath(d, 2), r = rng(seed); let out = '', acc = gap
  for (let i = 2; i < pts.length - 2; i++) {
    acc += 2
    const [x, y] = pts[i]
    if (acc < gap || !filter(x, y)) continue
    acc = 0
    const [ax, ay] = pts[i - 2], [bx, by] = pts[i + 2]; let tx = bx - ax, ty = by - ay; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m
    let nx = ty, ny = -tx
    if (inside(pts, [x + nx * 4, y + ny * 4])) { nx = -nx; ny = -ny }
    const k = 1 + (r() - .5) * 2 * jitter
    out += lock([x, y], [nx, ny], { len: len * k, w: w * (1 + (r() - .5) * .3), sweep, fill, ol, sw })
  }
  return out
}

// Воротник на груди: ряды локонов вниз от подбородка; задний ряд светлее/темнее, передний лежит поверх
export function chestRuff({ fill, fill2, ol }) {
  const rows = [
    { y: 462, from: 250, to: 344, n: 4, len: 62, w: 36, f: fill2 },
    { y: 442, from: 232, to: 362, n: 5, len: 50, w: 36, f: fill },
  ]
  return rows.map((rw, k) => Array.from({ length: rw.n }, (_, i) => {
    const x = rw.from + (rw.to - rw.from) * (i / (rw.n - 1)), o = x - 297
    return lock([x, rw.y], [o / 260, 1 - Math.abs(o) / 500], { len: rw.len * (1 + ((i + k) % 3 - 1) * .1), w: rw.w, sweep: .75, fill: rw.f, ol, sw: 5 })
  }).join('')).join('')
}

// Штрихи-текстура шерсти: короткие дужки по лбу, щекам и груди
export function furTicks(color) {
  const T = [[240, 205, -6], [352, 205, 6], [296, 160, 0], [200, 400, -18], [392, 400, 18], [170, 330, -14], [422, 330, 14], [262, 545, -4], [330, 545, 4], [296, 585, 0], [276, 620, -4], [318, 620, 4]]
  return T.map(([x, y, a]) => `<path d="M${x - 9} ${y + 5}Q${x} ${y - 7} ${x + 9} ${y + 5}" transform="rotate(${a} ${x} ${y})" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>`).join('')
}
