import { SPEED } from '../../player/modules/rotate-phone/wordLaneTimeline.js'

// Шкала финала «Шкала памяти» (чистые функции без DOM). Шкала — вертикальная линейка справа от верха ленты (под кнопками) до низа с отступом под скругление экрана. Пилюля едет вниз и толкает линию:
// линия появляется в миг, когда нижний край пилюли касается верха шкалы, и идёт за этим краем. Зона определяется положением линии на шкале: чем ниже, тем дольше вспоминалось слово и тем слабее оно держится.
// Баланс зон (владелец 2026-11-15): зелёная 45 %, жёлтая 35 %, красная 20 % длины шкалы.
export const ZONES = [{ id: 'fast', to: 0.45 }, { id: 'mid', to: 0.8 }, { id: 'slow', to: 1 }]

/** Зона по положению линии, долей длины шкалы (0 — верх, 1 — низ) */
export const zoneAt = p => (ZONES.find(z => p < z.to) ?? ZONES.at(-1)).id
/** Верх каждой зоны, доли длины шкалы: [0, 0,45, 0,8] */
export const EDGES = ZONES.map((_, i) => (i === 0 ? 0 : ZONES[i - 1].to))
/** Высота зоны, доли длины */
export const spanOf = id => { const i = ZONES.findIndex(z => z.id === id); return ZONES[i].to - EDGES[i] }
/** Риски линейки: каждые 5 % длины, длинные — на границах зон и краях; цвет риски — цвет её зоны → [{ p, major, zone }] */
export const TICKS = Array.from({ length: 21 }, (_, i) => { const p = i / 20; return { p, major: [0, 0.45, 0.8, 1].some(e => Math.abs(e - p) < 1e-9), zone: zoneAt(Math.min(p, 0.9999)) } })

export const HOLD_MS = 1800 // сколько линия остаётся на высоте ответа после принятия / «не успел»

/**
 * Какую пилюлю толкает линия (чистая логика кадра, без DOM). pills — [{ el, top, bottom, locked, failed }] (px от верха шкалы; el — любой маркер, нужен только для «та же пилюля»), H — длина шкалы,
 * tr — прежнее состояние { el, y, done, at } или null, now — часы. → новое состояние. Новая пилюля берётся, когда прежней нет или она закончена (принята / «не успел» / ушла далеко вниз): та, что ближе к верху, нижний край
 * уже коснулся верха шкалы (bottom > 0), не принята и не ушла. Тот же элемент берётся заново (пул пилюль переиспользует узлы: следующее слово едет на том же узле).
 */
let picks = 0 // номер взятой пилюли: линия, растворившаяся у низа для этой пилюли, второй раз не моргает (RaceBossScale)
export function trackStep(tr, pills, H, now) {
  let cur = tr
  if (cur && !cur.done) {
    const p = pills.find(x => x.el === cur.el)
    if (!p || p.locked || p.failed || p.top > H * 1.25) cur = { ...cur, done: true, at: now }
    else cur = { ...cur, y: p.bottom }
  }
  if (!cur || cur.done) {
    const next = pills.filter(p => !p.locked && !p.failed && p.bottom > 0 && p.top < H * 1.25).sort((a, b) => a.top - b.top)[0]
    if (next) return { id: ++picks, el: next.el, y: next.bottom, done: false, at: 0 }
  }
  return cur
}

/** Показана ли линия: идёт пилюля или после ответа не прошло HOLD_MS */
export const lineOn = (tr, now) => !!tr && (!tr.done || now - tr.at < HOLD_MS)

/** Пример при объяснении (владелец 2026-11-15): пилюля со словом едет по шкале так, чтобы у Мии НЕ БЫЛО ПАУЗ: реплики стоят в очереди подряд (look, think, green, yellow, red, five), а путь пилюли вычислен по их длительности —
 *  зона, о которой Мия говорит, пилюля проходит ровно за её реплику, и к началу следующей реплики пилюля на границе следующей зоны. Скорость между границами меняется плавно (монотонная кубическая интерполяция), без рывков и
 *  остановок; конвейер дорожек ускоряется и замедляется под скорость пилюли (onSpeed → подсказка скорости). Путь: из-за верхнего края (−75 %) на «видите шкалу» и «чем дольше думаете» к касанию верха шкалы (0), «зелёная» — до 45 %,
 *  «жёлтая» — до 80 %, «красная» — до низа (100 %), «пять красных» — пилюля уезжает за нижний край экрана (125 %). */
export const DEMO_START = 'boss_mia_look'
export const DEMO_IDS = ['boss_mia_look', 'boss_mia_think', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five']
export const DEMO_FROM = -0.75
export const DEMO_TO = 1.25
export const DEMO_GAP_MS = 350 // пауза очереди речи между репликами (miaSpeech.GAP_MS)
const DEMO_STOPS = [0, 0.45, 0.8, 1, DEMO_TO] // где пилюля к концу think / green / yellow / red / five
/** Монотонная кубическая интерполяция (Фритч–Карлсон) по узлам [[t, p]]: плавная скорость, пилюля не возвращается назад */
export function monotone(knots) {
  const n = knots.length, h = [], d = [], m = new Array(n)
  for (let i = 0; i < n - 1; i++) { h[i] = knots[i + 1][0] - knots[i][0]; d[i] = (knots[i + 1][1] - knots[i][1]) / h[i] }
  m[0] = d[0]; m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue } const a = m[i] / d[i], b = m[i + 1] / d[i], r = a * a + b * b; if (r > 9) { const k = 3 / Math.sqrt(r); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i] } }
  return t => {
    if (t <= knots[0][0]) return knots[0][1]
    if (t >= knots[n - 1][0]) return knots[n - 1][1]
    let i = 0; while (t > knots[i + 1][0]) i++
    const x = (t - knots[i][0]) / h[i], x2 = x * x, x3 = x2 * x
    return (2 * x3 - 3 * x2 + 1) * knots[i][1] + (x3 - 2 * x2 + x) * h[i] * m[i] + (-2 * x3 + 3 * x2) * knots[i + 1][1] + (x3 - x2) * h[i] * m[i + 1]
  }
}
/** План примера по длительностям реплик ms = { look, think, green, yellow, red, five } (мс) → { total, pos(t), segs: [{ t0, t1, from, to }] } — t в мс от начала реплики «видите шкалу справа?» */
export function demoPlan(ms, gap = DEMO_GAP_MS) {
  const d = [ms.look + gap + ms.think + gap, ms.green + gap, ms.yellow + gap, ms.red + gap, ms.five + gap]
  const knots = [[0, DEMO_FROM]]; let t = 0
  d.forEach((x, i) => { t += x; knots.push([t, DEMO_STOPS[i]]) })
  const segs = knots.slice(1).map((k, i) => ({ t0: knots[i][0], t1: k[0], from: knots[i][1], to: k[1] }))
  return { total: t, pos: monotone(knots), segs }
}
/** Скорость конвейера (доли обычной SPEED) на отрезке плана: путь пилюли в долях шкалы × длина шкалы (% высоты экрана) / секунды / SPEED */
export const segSpeed = (seg, scalePct) => (Math.abs(seg.to - seg.from) * scalePct) / ((seg.t1 - seg.t0) / 1000) / SPEED
/** Цвет примера (r, g, b) по положению p: зелёный → жёлтый → красный, переход плавный около границ зон (±0,05 длины шкалы) */
const RGB = { fast: [120, 230, 150], mid: [255, 200, 70], slow: [255, 96, 80] }
export function zoneRgb(p) {
  const sm = x => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u) }
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return mix(mix(RGB.fast, RGB.mid, sm((p - 0.45 + 0.05) / 0.1)), RGB.slow, sm((p - 0.8 + 0.05) / 0.1))
}
/** Реплики Мии, на которых загорается зона (мигает полупрозрачной заливкой), и реплики, с которых шкалу видно на церемонии («видите шкалу справа?» и дальше) */
export const FLASH_LINES = { boss_mia_green: 'fast', boss_mia_yellow: 'mid', boss_mia_red: 'slow' }
export const REVEAL_LINES = ['boss_mia_look', 'boss_mia_think', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five']
/** talk — реплика Мии { id, key, ms } (miaSpeech.onSpeak) → { zone, key, ms } или null */
export const flashOf = talk => (talk && FLASH_LINES[talk.id] ? { zone: FLASH_LINES[talk.id], key: talk.key, ms: talk.ms } : null)
