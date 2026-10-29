// Пул пилюль: в разметке (WordLanePills) лежит POOL одинаковых элементов, а движок выдаёт их повторам и кускам — пилюль в ступени до девяти (три повтора × три куска), и каждая живёт
// своей жизнью (полёт, заливка, щелчок). Элемент берётся (take) под дорожку — ему ставится дорожка (x и цвет), «тень» слова и полёт — и возвращается (give), когда пилюля ушла за край.
// Запись в DOM — только при изменении значения (put): лишние записи стоили бы пересчёта стилей на слабом телефоне.
// will-change (свой композитный слой) стоит ТОЛЬКО у взятых из пула пилюль и их заливки: take ставит, give снимает. Раньше слои держали все 12 пилюль + 12 заливок + 12 меток темпа даже в пуле —
// дерево слоёв пересобиралось почти каждый кадр (Layerize), а живых пилюль в ступени до девяти.
// Слои взятой пилюли СТОЯТ неизменно от take до give: will-change ставится в take ДО старта полёта (в одном задании с записью дорожки, заливки и data-held — браузер увидит уже готовое состояние), а снимается только в give,
// когда пилюля ушла за край или сцена кончилась; в полёте его не переключает никто. data-held нужен вёрстке: по нему слоям частиц заливки ставятся анимации и will-change (word-lane-pill.css), чтобы появление частиц
// (data-live) дерево слоёв не пересобирало — на iOS Safari такая пересборка заставляла контур пилюли мигать.
import { LANE_X, PILL_W } from './wordLaneTimeline.js'
import { startFlight } from './wordLaneMotion.js'
import { fillProfile } from './wordLaneTimeline.js'

export const POOL = 12
export const WILL_PILL = 'transform, translate, scale' // слои взятой пилюли: полёт (translate), хлопок (scale) и дрожка промаха (transform); transform в списке — гарантия слоя там, где will-change по translate/scale слой не создаёт
export const WILL_FILL = 'transform'        // и её заливки (движок пишет ей transform каждый кадр)
// «Наливается» (data-live → частицы в заливке, word-lane-pill.css): заливка выросла за последние LIVE_HOLD_MS; у принятой пилюли (data-lock) частицы держатся дольше и потом гаснут
export const LIVE_RISE_EPS = 0.0008  // рост за кадр меньше этого — шум, не «наливание»
export const LIVE_HOLD_MS = 320      // после последнего роста заливки пилюля «наливается» ещё столько мс (в кадрах роста бывают паузы)
export const LIVE_HOLD_LOCK_MS = 1200 // после принятия (data-lock) частицы идут ещё 1,2 с и гаснут

/** Заливка v (0…1) → transform слоя заливки: сдвиг вверх из-под нижнего края (0 — слой целиком ниже пилюли, 1 — на месте) */
export const fillTransform = v => `translateY(${((1 - Math.min(1, Math.max(0, v))) * 100).toFixed(1)}%)`

export function createPool(root) {
  const els = [...root.querySelectorAll('[data-pill]')]
  const parts = els.map(el => ({ el, fill: el.querySelector('.wlPillFill'), ghost: el.querySelector('.wlGhost'), bars: [...el.querySelectorAll('.wlGhost i')], pace: el.querySelector('.wlPace') }))
  const cache = new Map()
  const put = (el, prop, value) => { const prev = cache.get(el) ?? {}; if (prev[prop] === value) return; prev[prop] = value; cache.set(el, prev); el.style[prop] = value }
  const free = els.map((_, i) => i).reverse()
  const live = new Map() // индекс → { anim, lane }
  const rise = els.map(() => ({ v: 0, at: -1e9, on: false })) // для data-live: прошлая заливка, когда последний раз росла, горит ли признак

  // Заливка — сдвиг слоя вверх: translateY((1 − v)·100 %). Край ЕДЕТ, а не растягивается (scaleY сжимал градиент заливки)
  const paintFill = (k, v) => {
    put(parts[k].fill, 'transform', fillTransform(v))
    const r = rise[k], now = performance.now(), el = parts[k].el
    if (v > r.v + LIVE_RISE_EPS) r.at = now
    r.v = v
    const on = v > 0 && now - r.at < (el.getAttribute('data-lock') != null ? LIVE_HOLD_LOCK_MS : LIVE_HOLD_MS)
    if (on !== r.on) { r.on = on; if (on) el.setAttribute('data-live', '1'); else el.removeAttribute('data-live') }
  }
  const hint = (k, opacity, pace) => {
    put(parts[k].ghost, 'opacity', opacity)
    put(parts[k].pace, 'opacity', pace == null ? '0' : '0.9')
    if (pace != null) put(parts[k].pace, 'transform', `translateY(${(-pace * 100).toFixed(1)}%)`)
  }
  const clean = k => {
    Object.assign(rise[k], { v: 0, at: -1e9, on: false }); parts[k].el.removeAttribute('data-live')
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
      const { el, fill } = parts[k]
      clean(k)
      el.style.willChange = WILL_PILL; fill.style.willChange = WILL_FILL; el.setAttribute('data-held', '1')
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
      parts[k].el.style.willChange = ''; parts[k].fill.style.willChange = ''; parts[k].el.removeAttribute('data-held') // вернулась в пул — слои не держим
    },
    giveAll() { for (const k of [...live.keys()]) this.give(k) },
    /** Поставить пилюлю в центр дорожки без полёта (раунд «Порядок») */
    place(k, y) { put(parts[k].el, 'translate', `-50% calc(${y}dvh - 50%)`) },
    unplace(k) { parts[k].el.style.translate = ''; cache.get(parts[k].el) && delete cache.get(parts[k].el).translate },
    anims: () => [...live.values()].map(l => l.anim).filter(Boolean),
  }
}
