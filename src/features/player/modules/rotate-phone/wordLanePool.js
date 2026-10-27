// Пул пилюль: в разметке (WordLanePills) лежит POOL одинаковых элементов, а движок выдаёт их повторам и кускам — пилюль в ступени до девяти (три повтора × три куска), и каждая живёт
// своей жизнью (полёт, заливка, щелчок). Элемент берётся (take) под дорожку — ему ставится дорожка (x и цвет), «тень» слова и полёт — и возвращается (give), когда пилюля ушла за край.
// Запись в DOM — только при изменении значения (put): лишние записи стоили бы пересчёта стилей на слабом телефоне.
import { LANE_X, PILL_W } from './wordLaneTimeline.js'
import { startFlight } from './wordLaneMotion.js'
import { fillProfile } from './wordLaneTimeline.js'

export const POOL = 12

export function createPool(root) {
  const els = [...root.querySelectorAll('[data-pill]')]
  const parts = els.map(el => ({ el, fill: el.querySelector('.wlPillFill'), ghost: el.querySelector('.wlGhost'), bars: [...el.querySelectorAll('.wlGhost i')], pace: el.querySelector('.wlPace') }))
  const cache = new Map()
  const put = (el, prop, value) => { const prev = cache.get(el) ?? {}; if (prev[prop] === value) return; prev[prop] = value; cache.set(el, prev); el.style[prop] = value }
  const free = els.map((_, i) => i).reverse()
  const live = new Map() // индекс → { anim, lane }

  const paintFill = (k, v) => put(parts[k].fill, 'transform', `scaleY(${Math.min(1, Math.max(0, v)).toFixed(3)})`)
  const hint = (k, opacity, pace) => {
    put(parts[k].ghost, 'opacity', opacity)
    put(parts[k].pace, 'opacity', pace == null ? '0' : '0.9')
    if (pace != null) put(parts[k].pace, 'transform', `translateY(${(-pace * 100).toFixed(1)}%)`)
  }
  const clean = k => {
    paintFill(k, 0); hint(k, '0', null)
    parts[k].el.removeAttribute('data-lock'); parts[k].el.removeAttribute('data-fail'); parts[k].el.removeAttribute('data-hint'); parts[k].el.removeAttribute('data-voice')
  }
  /** Тень слова: ширина полосок по громкости куска слова диктора (без кривой — ровно) */
  const shape = (k, curve) => {
    const prof = fillProfile(curve, parts[k].bars.length || 10)
    parts[k].bars.forEach((b, i) => put(b, 'width', `${Math.round(30 + 60 * prof[i])}%`))
  }

  return {
    size: els.length,
    el: k => parts[k]?.el,
    paintFill, hint, shape,
    attr: (k, name, on = true) => { if (on) parts[k].el.setAttribute(name, '1'); else parts[k].el.removeAttribute(name) },
    /** Выдать пилюлю под дорожку lane; atMs — сколько мс полёта уже прошло (отрицательное — ждёт за краем). Без полёта (static) — стоит на месте. Возвращает номер или null, если пул пуст */
    take(lane, { atMs = 0, curve = null, flight = true } = {}) {
      const k = free.pop()
      if (k == null) return null
      const { el } = parts[k]
      clean(k)
      el.dataset.lane = String(lane)
      put(el, 'left', `${LANE_X[lane]}%`); put(el, 'width', `${PILL_W}%`)
      shape(k, curve)
      live.set(k, { anim: flight ? startFlight(el, atMs) : null, lane })
      return k
    },
    give(k) {
      const l = live.get(k)
      if (!l) return
      try { l.anim?.cancel() } catch { /* уже снята */ }
      live.delete(k); clean(k); free.push(k)
    },
    giveAll() { for (const k of [...live.keys()]) this.give(k) },
    /** Поставить пилюлю в центр дорожки без полёта (раунд «Порядок») */
    place(k, y) { put(parts[k].el, 'translate', `-50% calc(${y}dvh - 50%)`) },
    unplace(k) { parts[k].el.style.translate = ''; cache.get(parts[k].el) && delete cache.get(parts[k].el).translate },
    anims: () => [...live.values()].map(l => l.anim).filter(Boolean),
  }
}
