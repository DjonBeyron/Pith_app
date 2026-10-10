import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Сторож цельности старта волн (0–1,5 с после нажатия): волны активации, циклические и эквалайзер не должны «перебивать» друг друга — между затуханием активации и проявлением циклических
// не бывает пустого места, ни одна волна не включается/гаснет скачком. Суммарное «покрытие» волн ЗА обводкой считаем по ключевым кадрам CSS (say-phrase-waves.css) с настоящими кривыми
// (cubic-bezier): Σ прозрачность × видимая часть толщины × радиус (длина кольца), как делают пиксели. Модель сверена со снимками headless-Chromium (покадрово, каждые 33 мс): совпадает по форме.
// Прежняя хореография (активация .6 с ease-out, циклические с задержкой .55 с, прозрачность 10% → .36) прогоняется тем же кодом и обязана ПРОВАЛИТЬ сторожа — иначе сторож пуст.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = read('../../../../styles/player/panels/say-phrase-waves.css').replace(/\/\*[\s\S]*?\*\//g, '')
const stateCss = read('../../../../styles/player/panels/say-phrase-state.css').replace(/\/\*[\s\S]*?\*\//g, '')
const num = (s, re) => Number(s.match(re)[1])

function bez(x1, y1, x2, y2) {
  const c = (a, b) => [3 * a, 3 * (b - a) - 3 * a, 1 - 3 * a - (3 * (b - a) - 3 * a)]
  const [cx, bx, ax] = c(x1, x2), [cy, by, ay] = c(y1, y2)
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t
  return x => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0, hi = 1, t = x
    for (let i = 0; i < 40; i++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2 }
    return Y(t)
  }
}
const EASE = { linear: x => x, 'ease-out': bez(0, 0, 0.58, 1), 'ease-in-out': bez(0.42, 0, 0.58, 1), ease: bez(0.25, 0.1, 0.25, 1) }
const stops = (stopList, p, ease) => {
  for (let i = 0; i < stopList.length - 1; i++) {
    const [p0, v0] = stopList[i], [p1, v1] = stopList[i + 1]
    if (p <= p1) return v0 + (v1 - v0) * EASE[ease]((p - p0) / (p1 - p0))
  }
  return stopList[stopList.length - 1][1]
}
// кольцо: { delay, scale: { dur, ease, to }, fade: { dur, ease, stops }, loop }; до старта (backwards/both) — масштаб 1, прозрачность 0; без loop после конца прозрачность 0, масштаб держится
function ring(t, c) {
  const local = t - c.delay
  if (local < 0) return { s: 1, o: 0 }
  const at = d => (c.loop ? (local % d) / d : Math.min(1, local / d))
  const s = 1 + (c.scale.to - 1) * EASE[c.scale.ease](at(c.scale.dur))
  const o = !c.loop && local > c.fade.dur ? 0 : stops(c.fade.stops, at(c.fade.dur), c.fade.ease)
  return { s, o }
}
const VIS_PX = 2.5, W = 1.7
function ink(rings, t, layer = 1) {
  const a = 1 + 0.15 * EASE['ease-in-out'](Math.min(1, t / 850)) // якорь растёт ×1,15 за .85 с
  return rings.reduce((sum, c) => { const { s, o } = ring(t, c); const vis = Math.min(1, Math.max(0, (53.125 * a * (s - 1) - VIS_PX) / W)); return sum + o * vis * s * W * layer }, 0)
}
const curve = ({ act, cyc }) => Array.from({ length: 151 }, (_, i) => { const t = i * 0.01; return ink(act, t) + ink(cyc, t, EASE.ease(Math.min(1, t / 0.4))) })

// параметры из CSS
function fromCss() {
  const a = css.match(/\.sayWaveClip--live \.sayActWaves i \{ animation: sayActScale ([\d.]+)s (ease-out) both, sayActFade ([\d.]+)s (ease-in-out) both; \}/)
  const d2 = num(css, /\.sayActWaves i:nth-child\(2\) \{ animation-delay: ([\d.]+)s, /), d3 = num(css, /\.sayActWaves i:nth-child\(3\) \{ animation-delay: ([\d.]+)s, /)
  const fade = css.match(/@keyframes sayActFade \{\s*0%\s*\{ opacity: 0; \}\s*(\d+)%\s*\{ opacity: ([\d.]+); \}\s*100%\s*\{ opacity: 0; \}/)
  const to = num(css, /@keyframes sayActScale \{[\s\S]*?to\s*\{ transform: scale\(([\d.]+)\)/)
  const act = [0, d2, d3].map(d => ({ delay: d, scale: { dur: +a[1], ease: a[2], to }, fade: { dur: +a[3], ease: a[4], stops: [[0, 0], [fade[1] / 100, +fade[2]], [1, 0]] } }))
  const c = css.match(/\.sayWaveClip--cyc \.sayCycWaves i \{ animation: sayCycScale ([\d.]+)s (linear) infinite backwards, sayCycFade ([\d.]+)s (ease-in-out) infinite backwards;/)
  const c2 = num(css, /\.sayCycWaves i:nth-child\(2\) \{ animation-delay: ([\d.]+)s, /), c3 = num(css, /\.sayCycWaves i:nth-child\(3\) \{ animation-delay: ([\d.]+)s, /)
  const cf = css.match(/@keyframes sayCycFade \{\s*0%\s*\{ opacity: 0; \}\s*(\d+)%\s*\{ opacity: ([\d.]+); \}\s*100%\s*\{ opacity: 0; \}/)
  const cto = num(css, /@keyframes sayCycScale \{[\s\S]*?to\s*\{ transform: scale\(([\d.]+)\)/)
  const cyc = [0, c2, c3].map(d => ({ delay: d, loop: true, scale: { dur: +c[1], ease: c[2], to: cto }, fade: { dur: +c[3], ease: c[4], stops: [[0, 0], [cf[1] / 100, +cf[2]], [1, 0]] } }))
  return { act, cyc }
}
// прежняя хореография (v3.2.1922): одна анимация на кольцо, ease-out на оба свойства, циклические с задержкой .55 с и пиком прозрачности на 10%
const OLD = {
  act: [0, 0.1, 0.2].map(d => ({ delay: d, scale: { dur: 0.6, ease: 'ease-out', to: 1.55 }, fade: { dur: 0.6, ease: 'ease-out', stops: [[0, 0], [0.15, 0.5], [1, 0]] } })),
  cyc: [0.55, 1.25, 1.95].map(d => ({ delay: d, loop: true, scale: { dur: 2.1, ease: 'linear', to: 1.45 }, fade: { dur: 2.1, ease: 'linear', stops: [[0, 0], [0.1, 0.36], [0.5, 0.16], [1, 0]] } })),
}
function metrics(T) {
  const peak = Math.max(...T), pi = T.indexOf(peak)
  let rebound = 0, run = Infinity
  for (let i = pi; i < T.length; i++) { run = Math.min(run, T[i]); rebound = Math.max(rebound, T[i] - run) }
  // kink3 — вторая разность по кадру 33 мс (3 шага по 10 мс)
  return { peak, floor: Math.min(...T.slice(pi)) / peak, rebound: rebound / peak, first: T[3] / peak, kink3: Math.max(...T.slice(0, 145).map((_, i) => Math.abs(T[i + 6] - 2 * T[i + 3] + T[i]))) / peak }
}

describe('say_phrase — цельность старта волн: активация → циклические без «дыры» и скачков', () => {
  const now = metrics(curve(fromCss()))
  const old = metrics(curve(OLD))

  it('CSS: активация — две анимации (масштаб ease-out, прозрачность ease-in-out без вспышки), циклические стартуют вместе с активацией (без задержки) и тоже проступают плавно', () => {
    const p = fromCss()
    expect(p.act.map(r => r.delay)).toEqual([0, 0.15, 0.3])
    expect(p.cyc.map(r => r.delay)).toEqual([0, 0.7, 1.4]) // у первой нет задержки: прежние .55 с и «дыра» между волнами
    expect(p.cyc[0].fade.stops[1][0]).toBeGreaterThanOrEqual(0.25) // прозрачность набирается не быстрее, чем за четверть пути (прежние 10%)
    expect(p.act[0].fade.dur).toBeGreaterThanOrEqual(0.9)          // активация спадает не раньше, чем циклическая наберёт яркость
    expect(css).not.toMatch(/sayActWave\b|sayCycWave\b|animation-delay: \.55s/)
  })

  it('нет провала: после пика покрытие за обводкой не падает ниже 30% пика (раньше 4% пика в пикселях на 0,73 с) и не отскакивает вверх больше чем на 10% пика (раньше +50% в пикселях, +26% в модели)', () => {
    expect(now.floor).toBeGreaterThan(0.3)
    expect(now.rebound).toBeLessThan(0.1)
    expect(old.floor).toBeLessThan(0.05)     // сторож не пуст: прежняя последовательность проваливалась
    expect(old.rebound).toBeGreaterThan(0.2)
  })

  it('нет скачков: первые 30 мс почти ничего (≤ 3% пика; в пикселях раньше 22% — вспышка колец эквалайзера), вторая разность по кадру 33 мс ≤ 10% пика (раньше 26% в пикселях, 35% в модели)', () => {
    expect(now.first).toBeLessThan(0.03)
    expect(now.kink3).toBeLessThan(0.1)
    expect(old.kink3).toBeGreaterThan(0.15)
  })

  it('кривые кривых: модель понимает ease-out / ease-in-out / linear и якорь ×1,15 за ту же кривую, что в state.css (--say-ease)', () => {
    expect(stateCss).toMatch(/--say-ease: cubic-bezier\(\.37, 0, \.63, 1\)/)
    expect(stateCss).toMatch(/--say-fill-t: \.85s/)
    expect(EASE['ease-in-out'](0.5)).toBeCloseTo(0.5, 6)
    expect(EASE['ease-out'](0.5)).toBeGreaterThan(0.5)
    expect(EASE.linear(0.3)).toBe(0.3)
  })
})
