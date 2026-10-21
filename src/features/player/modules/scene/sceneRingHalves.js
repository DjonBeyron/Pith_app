// Кольцо кружка-сцены из двух половинок на transform: rotate — анимация идёт на композиторе и не дёргается, когда главный поток
// занят (конец сцены: переход к следующей ноде, замена кадра статикой, панель отладки). Прежняя дуга SVG (stroke-dashoffset)
// анимируется на главном потоке — в конце кольцо «втыкалось» на iPhone (жалоба 2026-10-21), хотя по времени всё сходилось.
//
// Геометрия (scene.css): две маски — правая и левая половины круга (overflow: hidden); в каждой — полная окружность-рамка,
// у которой закрашена только одна половина (clip-path), центр окружности на внутреннем крае маски. Правая дуга: закрашена левая
// половина, поворот 0 → 180° выводит её в правую маску от 12 часов по часовой; левая дуга: закрашена правая половина, поворот
// 0 → 180° ведёт от 6 часов к 12. Прогресс v ∈ 0…1 → углы: правая = 360·min(v, ½), левая = 360·max(0, v − ½).
// Чистая логика без DOM: углы и ключевые кадры для WAAPI (sceneRingHalves.test.js); шаг через v = ½ режется на два кадра,
// чтобы кусочно-линейные углы не срезались.

export const RING_SPLIT = 0.5

export function ringAngles(v) {
  const x = Math.min(1, Math.max(0, v))
  return { r: 360 * Math.min(x, RING_SPLIT), l: 360 * Math.max(0, x - RING_SPLIT) }
}

const rot = deg => `rotate(${Math.round(deg * 1000) / 1000}deg)`

/** Ключевые кадры обеих дуг для шагов [{ to, ms }] от значения from: { right, left, total } (кадры с offset 0…1) */
export function ringKeyframes(from, steps) {
  const run = steps.filter(s => s.ms > 0)
  const total = run.reduce((a, s) => a + s.ms, 0)
  const points = [{ v: from, t: 0 }]
  let acc = 0
  let v = from
  for (const s of run) {
    // Пересечение половины внутри шага — промежуточный кадр в момент пересечения
    if ((v < RING_SPLIT && s.to > RING_SPLIT) || (v > RING_SPLIT && s.to < RING_SPLIT)) {
      points.push({ v: RING_SPLIT, t: acc + s.ms * ((RING_SPLIT - v) / (s.to - v)) })
    }
    acc += s.ms
    v = s.to
    points.push({ v, t: acc })
  }
  const off = t => (total > 0 ? Math.min(1, Math.max(0, t / total)) : 0)
  return {
    right: points.map(p => ({ transform: rot(ringAngles(p.v).r), offset: off(p.t) })),
    left: points.map(p => ({ transform: rot(ringAngles(p.v).l), offset: off(p.t) })),
    total,
  }
}

// Элементы дуг внутри кольца (SceneCircleView): [data-arc="r"] и [data-arc="l"]
export const arcsOf = el => ({ r: el?.querySelector?.('[data-arc="r"]') ?? null, l: el?.querySelector?.('[data-arc="l"]') ?? null })

/** Поставить значение без анимации (обе дуги + data-progress для панели отладки) */
export function setRingValue(el, v) {
  const { r, l } = arcsOf(el)
  const a = ringAngles(v)
  if (r) r.style.transform = rot(a.r)
  if (l) l.style.transform = rot(a.l)
  if (el?.dataset) el.dataset.progress = String(Math.round(v * 1000) / 1000)
}

/** Запустить анимацию кольца; возвращает объект с cancel() и onfinish (как у Animation), null — анимировать нечем */
export function animateRing(el, from, steps, { lag = 0, animate = (node, kf, o) => node.animate(kf, o) } = {}) {
  const { r, l } = arcsOf(el)
  if (!r || !l || typeof r.animate !== 'function') return null
  const kf = ringKeyframes(from, steps)
  if (!kf.total) return null
  const opts = { duration: kf.total, easing: 'linear', fill: 'forwards', delay: -Math.min(lag, kf.total) }
  const ar = animate(r, kf.right, opts)
  const al = animate(l, kf.left, opts)
  const h = {
    cancel() { try { ar.cancel() } catch { /* ignore */ } try { al.cancel() } catch { /* ignore */ } },
    set onfinish(fn) { ar.onfinish = fn },
  }
  return h
}
