// Капли из жидкости пилюли (2026-11-10, владелец со стенда пилюль: «нужно, чтобы частицы как бы выпрыгивали из заполняемой жидкости»). Пока заливка РАСТЁТ, пул (wordLanePool.paintFill) зовёт rise():
// на ПОВЕРХНОСТИ жидкости — на текущей линии заливки — рождается капля и вылетает по направлению заливки (вертикальная пилюля — вверх, широкая «Фраз» — вправо), описывает короткую дугу и гаснет.
// Место рождения считается из той же заливки v, что пишется слою (сплошной край слоя заливки: он на --wl-soft длиннее клипа — тот же отсчёт, что у искр и кромки, edge20), поэтому офсета между линией и
// каплями нет; у скруглённого торца поверхность уже — капли не рождаются за дугой капсулы.
// УПРЕЖДЕНИЕ: поверхность сама едет (при доезде после зачёта — весь остаток пилюли за 96 мс), и капля с коротким прыжком тут же оказалась бы ПОД жидкостью. Поэтому к прыжку прибавляется путь, который
// поверхность ещё пройдёт: при доезде (rush — пул знает, что пилюля принята) — весь остаток до края, капля вылетает за край вместе с жидкостью, туда же бьёт залп щелчка (wordLaneSnap.js);
// при обычном росте — скорость заливки × JET_LEAD_MS (не больше JET_LEAD_MAX длины пилюли).
// Бюджет: узел <i class="wlJet"> на каплю (вид — word-lane-jets.css), не больше JET_MAX (в доезде JET_RUSH_MAX) живых на пилюлю, не чаще JET_GAP_MS; одна WAAPI-анимация transform + opacity на композиторе,
// по её концу узел удаляется — у покоящейся пилюли ни узлов, ни анимаций. Без filter и will-change. На слабом устройстве (deviceTier.isWeakDevice, класс wl--lite) капель нет.
// «Случайность» — свой счётчик, а не случайные числа браузера: запись стенда и тесты повторяемы.
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'

export const JET_GAP_MS = 80        // между каплями одной пилюли при обычном росте
export const JET_RUSH_GAP_MS = 30   // и при доезде после зачёта
export const JET_MAX = 6            // живых капель на пилюлю при обычном росте
export const JET_RUSH_MAX = 10      // и при доезде
export const JET_MS = 440           // жизнь капли (± 20 %)
export const JET_RUSH_MS = 340      // при доезде короче: к вершине дуги (половина жизни) жидкость уже у края
export const JET_LEAD_MS = 110      // обычный рост: поверхность ещё проедет столько мс с той же скоростью — капля летит с упреждением
export const JET_LEAD_MAX = 0.45    // но не дальше этой доли длины пилюли
export const SOFT_PX = 8            // --wl-soft: на столько слой заливки длиннее клипа (word-lane-pill.css)
export const GAP_PX = 2             // --gap: отступ клипа от края пилюли

/** Где поверхность жидкости при заливке v (0…1): geo = { w, h — размер клипа заливки, px; wide — широкая пилюля (заливка слева направо) } → { x, y — точка на линии заливки по центру пилюли, px от её внутреннего
 *  края; half — полуширина поверхности в этом месте (у торца капсулы она уже) } */
export function jetOrigin(v, { w, h, wide = false }) {
  const f = Math.min(1, Math.max(0, v)), along = wide ? w : h, r = (wide ? h : w) / 2
  const d = Math.min(f, 1 - f) * along                                       // до ближайшего торца
  const half = Math.max(r * 0.3, d >= r ? r : Math.sqrt(Math.max(0, d * (2 * r - d))))
  return wide ? { x: GAP_PX + f * (w + SOFT_PX) - SOFT_PX / 2, y: GAP_PX + r, half } : { x: GAP_PX + r, y: GAP_PX + (1 - f) * (h + SOFT_PX), half }
}

/** Упреждение, px: сколько поверхность ещё пройдёт. rush — доезд после зачёта: весь остаток до края; иначе speed (доля пилюли в мс) × JET_LEAD_MS, не больше JET_LEAD_MAX длины */
export function jetLead(v, { w, h, wide = false }, { rush = false, speed = 0 } = {}) {
  const along = (wide ? w : h) + SOFT_PX, f = Math.min(1, Math.max(0, v))
  return rush ? (1 - f) * along : Math.min(JET_LEAD_MAX * along, Math.max(0, speed) * JET_LEAD_MS * along)
}

/** Кадры полёта капли: вылет из поверхности по направлению заливки, вершина дуги (lead — упреждение, px — плюс сам прыжок), лёгкий спад с угасанием. a, b — 0…1 (высота прыжка и снос), rush — доезд (прыжок выше) */
export function jetFrames({ wide = false, rush = false, a = 0.5, b = 0.5, lead = 0 }) {
  const jump = (rush ? 14 : 10) + a * (rush ? 16 : 10), far = lead + jump, side = (b - 0.5) * (rush ? 22 : 12)
  const at = (along, across, s, o) => ({ transform: `translate(${(wide ? along : across).toFixed(1)}px, ${(wide ? across : -along).toFixed(1)}px) scale(${s})`, opacity: o })
  return [
    { ...at(0, 0, 0.5, 0.95), easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    { ...at(far, side * 0.6, 1, 1), offset: 0.5, easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)' },
    wide ? at(far + jump * 0.15, side + 5, 0.6, 0) : at(far - jump * 0.4, side, 0.6, 0),
  ]
}

export function createJets({ now = () => performance.now(), off = isWeakDevice } = {}) {
  const live = new Map() // пилюля → { at — когда родилась последняя капля, set — живые узлы }
  let seed = 20261110
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  return {
    /** Заливка пилюли el выросла до v: geo — размер ёмкости, rush — доезд после зачёта, speed — скорость роста (доля пилюли в мс) → сколько капель родилось */
    rise(el, v, geo, { rush = false, speed = 0 } = {}) {
      if (off() || !el?.animate || !el.ownerDocument?.createElement || !(geo?.w > 0 && geo.h > 0) || el.hasAttribute?.('data-fail')) return 0
      const t = now(), s = live.get(el) ?? { at: -Infinity, set: new Set() }
      const n = Math.min((rush ? JET_RUSH_MAX : JET_MAX) - s.set.size, rush ? 2 : 1)
      if (n <= 0 || t - s.at < (rush ? JET_RUSH_GAP_MS : JET_GAP_MS)) return 0
      s.at = t; live.set(el, s)
      const o = jetOrigin(v, geo), lead = jetLead(v, geo, { rush, speed })
      for (let i = 0; i < n; i++) {
        const node = el.ownerDocument.createElement('i'), size = (3.5 + rnd() * 2.5).toFixed(1), shift = (rnd() * 2 - 1) * o.half * (rush ? 0.45 : 0.8) // при доезде — ближе к оси: капля выходит через торец, а не сквозь стенку капсулы
        node.className = 'wlJet'
        node.style.cssText = `left:${(o.x + (geo.wide ? 0 : shift)).toFixed(1)}px;top:${(o.y + (geo.wide ? shift : 0)).toFixed(1)}px;width:${size}px;height:${size}px;`
        el.appendChild(node); s.set.add(node)
        const a = node.animate(jetFrames({ wide: !!geo.wide, rush, a: rnd(), b: rnd(), lead }), { duration: Math.round((rush ? JET_RUSH_MS : JET_MS) * (0.8 + rnd() * 0.4)), fill: 'forwards' })
        const done = () => { node.remove(); s.set.delete(node); if (!s.set.size && live.get(el) === s && now() - s.at > JET_GAP_MS) live.delete(el) }
        if (a?.finished) a.finished.then(done, done); else done()
      }
      return n
    },
    /** Пилюля вернулась в пул: капли убираются сразу */
    clear(el) {
      const s = live.get(el)
      if (!s) return
      live.delete(el)
      for (const node of [...s.set]) { try { node.getAnimations?.().forEach(a => a.cancel()) } catch { /* уже сняты */ } node.remove() }
      s.set.clear()
    },
    count: el => live.get(el)?.set.size ?? 0,
  }
}
