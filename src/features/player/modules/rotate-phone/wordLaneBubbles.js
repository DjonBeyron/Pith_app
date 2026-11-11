// Пузыри в жидкости пилюли (v3.3.186; владелец со стенда пилюль: «частицы должны быть как единый кластер, внутри они как в жидкости плавают в заполненной части капсулы, и как только заполнится
// капсула, они вырываются сверху наружу»). Раньше частиц было три вида: искры-плитки (поднимались выше поверхности), капли (вылетали из жидкости, пока она росла) и залп щелчка (новые частицы рядом).
// Теперь ОДИН набор узлов на пилюлю: пока заливка растёт или стоит, пузыри плавают ПОД поверхностью; в кадре хлопка (заливка дошла до 100 %) те же узлы вылетают наружу. Пока слово не засчитано — наружу ничего.
//  • Набор — <span class="wlBubs"> + BUB_COUNT узлов <span class="wlBub"> (не <i>: правила слоя уровня «.wlPillSparks i» их не касаются); наборов на пул не больше BUB_SETS (создаются один раз и переходят от пилюли к пилюле; узлы по кадрам не создаются и не удаляются).
//    Набор кладётся в слой уровня пилюли (.wlPillSparks) при первом росте заливки и получает тот же transform, что линия уровня (wordLaneLevel.levelTransform) — кластер едет вместе с поверхностью,
//    вверх и вниз, без покадровых записей узлам.
//  • Дом пузыря — глубина под поверхностью (вдоль оси заливки) и смещение поперёк; он подобран так, чтобы пузырь с учётом покачивания не касался поверхности и стенок при ЛЮБОЙ заливке: поперёк — не шире
//    капсулы у переднего торца (при 100 % пузыри лежат в его дуге), а пока жидкости под пузырём мало (он упёрся бы в дальний торец) — пузырь выключен (data-off, порог заливки von): кластер растёт с уровнем.
//  • Покачивание — CSS-анимация transform + opacity на композиторе (word-lane-bubbles.css), идёт только у наливающейся пилюли (data-live), иначе на паузе; в покое идущих анимаций нет.
//  • burst(el) — хлопок: каждый видимый пузырь с того места, где он сейчас (вычисленный transform), летит наружу: вертикальная пилюля — вверх через верхний торец, широкая — вверх через стенку у переднего
//    торца (справа до края экрана ≈ 40 px — веер вправо обрезался бы; жидкость ударила в торец — брызги вверх). Одна WAAPI-анимация на узел; по концу набор возвращается в запас.
// На слабом устройстве (deviceTier.isWeakDevice, класс wl--lite) пузырей нет. «Случайность» — свой счётчик: запись стенда и тесты повторяемы. Без filter и will-change.
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { SOFT_PX, SURF_PX, FULL_V, surfaceAt, halfAt } from './wordLaneLevel.js'

export const BUB_COUNT = 8          // пузырей в наборе
export const BUB_SETS = 3           // наборов на пул: столько пилюль одновременно держат пузыри (остальные — без них)
export const BUB_BOB = 6            // запас на покачивание вдоль оси, px (кадры wlBub* — не больше ± 5 px)
export const BUB_SWAY = 3           // и поперёк
export const BUB_MIN_DEPTH = 7      // самый верхний пузырь: центр на столько + радиус + покачивание ниже поверхности
export const BUB_SPAN = 0.6         // глубина кластера — не больше этой доли длины пилюли…
export const BUB_SPAN_PX = 118      // …и не больше стольких px
export const BURST_MS = 600         // вылет: 600…920 мс
const owners = new WeakMap()        // пилюля → её пул пузырей (для хлопка: wordLaneSnap.snapPill знает только узел пилюли)

const lcg = seed => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 } }

/** Дома пузырей набора для ёмкости geo = { w, h — клип заливки, px; wide }: [{ d — центр ниже поверхности вдоль оси, o — смещение поперёк от оси, r — радиус, von — с какой заливки пузырь виден }] */
export function bubbleHomes(geo, count = BUB_COUNT, seed = 22) {
  const rnd = lcg(seed), L = geo.wide ? geo.w : geo.h, R = (geo.wide ? geo.h : geo.w) / 2
  const span = Math.min(L * BUB_SPAN, BUB_SPAN_PX)
  return Array.from({ length: count }, (_, i) => {
    const r = 1.7 + rnd() * 1.9, top = r + BUB_BOB + BUB_MIN_DEPTH
    const d = top + ((i + rnd() * 0.7) / count) * Math.max(0, span - top)
    const pad = r + BUB_SWAY + 2                                                              // центр пузыря — внутри капсулы, ужатой на радиус, покачивание и зазор
    const o = (i % 2 ? 1 : -1) * (0.2 + 0.8 * rnd()) * halfAt(L - (d - BUB_BOB - SURF_PX), geo, pad)                 // по разные стороны от оси через один; у переднего торца при заливке 1 (верх хода пузыря — на d − покачивание − SURF_PX от торца) — не шире дуги
    const aMin = R - Math.sqrt(Math.max(0, (R - pad) ** 2 - o * o))                           // у дальнего торца: ближе к нему центр с таким смещением не помещается
    return { d, o, r, von: Math.min(0.97, (aMin + BUB_BOB + d + SURF_PX) / (L + SOFT_PX)) }
  })
}

/** Сколько пузырей видно при заливке v (homes — bubbleHomes) */
export const bubblesAt = (homes, v) => homes.filter(h => v >= h.von).length

/** Где пузырь: px от левого верхнего угла клипа заливки при заливке v */
export function bubblePos(h, v, geo) {
  const a = surfaceAt(v, geo) - h.d
  return geo.wide ? { x: a, y: geo.h / 2 + h.o } : { x: geo.w / 2 + h.o, y: geo.h - a }
}

/** Кадры вылета пузыря: from — { transform, opacity } сейчас; дом h при заливке 1; a, b — 0…1 (высота и снос). Пузырь уходит за торец / стенку и гаснет уже снаружи */
export function burstFrames(h, geo, { from = {}, a = 0.5, b = 0.5 } = {}) {
  const p = bubblePos(h, 1, geo)
  const up = p.y + 6 + 16 + a * 46                                           // до верхнего края клипа, обводка с зазором и ещё 16…62 px над пилюлей
  const side = geo.wide ? 5 + b * 26 : h.o * 0.5 + (b - 0.5) * 60
  const at = (k, s, o) => ({ transform: `translate(${(side * k).toFixed(1)}px, ${(-up * Math.min(1, k * 1.18)).toFixed(1)}px) scale(${s})`, opacity: o })
  return [
    { transform: from.transform && from.transform !== 'none' ? from.transform : 'translate(0px, 0px) scale(1)', opacity: from.opacity ?? 1, easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)' },
    { ...at(0.55, 1.12, 1), offset: 0.34, easing: 'cubic-bezier(0.3, 0.4, 0.6, 1)' },
    { ...at(0.85, 1.15, 1), offset: 0.62, easing: 'ease-in' },
    { transform: `translate(${side.toFixed(1)}px, ${(-up + 7).toFixed(1)}px) scale(0.5)`, opacity: 0 },
  ]
}

export function createBubbles({ off = isWeakDevice, sets = BUB_SETS, count = BUB_COUNT, view = el => el.ownerDocument?.defaultView } = {}) {
  const pool = [], held = new Map(), spent = new WeakSet() // наборы; пилюля → её набор; пилюли, чьи пузыри уже вылетели (до возврата в пул новых не дают)
  const api = { level, burst, clear, count: el => held.get(el)?.on ?? 0, out: el => !!held.get(el)?.out, sets: () => pool.length }

  function make(doc) {
    const box = doc.createElement('span'); box.className = 'wlBubs'
    const nodes = Array.from({ length: count }, () => { const n = doc.createElement('span'); n.className = 'wlBub'; n.setAttribute('data-off', '1'); box.appendChild(n); return n })
    const s = { box, nodes, homes: [], key: '', geo: null, owner: null, on: 0, out: false, anims: [], tf: '', seed: 22 + pool.length * 7 }
    pool.push(s); return s
  }
  function attach(el, geo) {
    const host = el.querySelector?.('.wlPillSparks'), doc = el.ownerDocument
    if (!host || !doc?.createElement) return null
    const s = pool.find(x => !x.owner) ?? (pool.length < sets ? make(doc) : null)
    if (!s) return null
    const key = `${geo.w}x${geo.h}${geo.wide ? 'w' : ''}`
    if (s.key !== key) {
      s.key = key; s.geo = { w: geo.w, h: geo.h, wide: !!geo.wide }; s.homes = bubbleHomes(geo, count, s.seed)
      const rnd = lcg(s.seed + 5)
      s.nodes.forEach((n, i) => {
        const h = s.homes[i], size = (h.r * 2).toFixed(1), dur = (1.7 + rnd() * 1.5).toFixed(2), lag = (-rnd() * 3).toFixed(2)
        const pos = geo.wide ? `left:${(-h.d).toFixed(1)}px;top:calc(50% + ${h.o.toFixed(1)}px);` : `left:calc(50% + ${h.o.toFixed(1)}px);top:${(SURF_PX + h.d).toFixed(1)}px;`
        n.style.cssText = `${pos}width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${lag}s;`
      })
    }
    s.owner = el; s.on = 0; s.out = false; s.tf = ''
    s.nodes.forEach(n => n.setAttribute('data-off', '1'))
    s.box.removeAttribute('data-out'); host.appendChild(s.box)
    held.set(el, s); owners.set(el, api)
    return s
  }
  function release(s) {
    for (const a of s.anims) { try { a.cancel() } catch { /* уже снята */ } }
    s.anims = []; s.box.remove?.()
    if (s.owner) held.delete(s.owner)
    s.owner = null; s.on = 0; s.out = false
  }
  /** Заливка пилюли el стала v: geo — ёмкость, tf — transform слоя уровня (тот же, что у линии), grew — выросла (набор выдаётся только растущей; пилюле, залитой до края одним шагом — тап, «Порядок» — пузыри не нужны:
   *  плавать им было негде, щелчок даст запасной залп) → сколько пузырей видно */
  function level(el, v, geo, tf, grew = false) {
    let s = held.get(el)
    if (s?.out) return s.on
    if (!s) {
      if (!grew || !(v > 0) || v >= FULL_V || spent.has(el) || off() || !(geo?.w > 0 && geo.h > 0) || el.hasAttribute?.('data-fail')) return 0
      s = attach(el, geo)
      if (!s) return 0
    }
    if (v <= 0.001) { release(s); return 0 }
    if (s.tf !== tf) { s.tf = tf; s.box.style.transform = tf }
    let on = 0
    s.nodes.forEach((n, i) => {
      const show = v >= s.homes[i].von
      if (show) on++
      if (show === n.hasAttribute('data-off')) { if (show) n.removeAttribute('data-off'); else n.setAttribute('data-off', '1') }
    })
    s.on = on
    return on
  }
  /** Хлопок: видимые пузыри пилюли el вылетают наружу (те же узлы) → сколько вылетело; набор вернётся в запас, когда долетят */
  function burst(el) {
    const s = held.get(el)
    if (!s || s.out) return 0
    const rnd = lcg(s.seed + 11), win = view(el), cs = n => win?.getComputedStyle?.(n), geo = s.geo
    const live = s.nodes.map((n, i) => ({ n, h: s.homes[i] })).filter(x => !x.n.hasAttribute('data-off') && x.n.animate)
    if (!live.length) { release(s); spent.add(el); return 0 }
    const dMax = Math.max(...live.map(x => x.h.d))
    const now = live.map(x => { const st = cs(x.n); return { transform: st?.transform, opacity: st ? Number(st.opacity) : 1 } }) // все чтения — до первой записи
    s.out = true; spent.add(el); s.box.setAttribute('data-out', '1')
    s.anims = live.map((x, i) => x.n.animate(burstFrames(x.h, geo, { from: now[i], a: rnd(), b: rnd() }), { duration: Math.round(BURST_MS + rnd() * 320), delay: Math.round((x.h.d / dMax) * 70), fill: 'both' }))
    const done = () => { if (s.out && s.owner === el) release(s) }
    Promise.all(s.anims.map(a => a?.finished ?? Promise.resolve())).then(done, done)
    return live.length
  }
  /** Пилюля вернулась в пул: пузыри убираются сразу */
  function clear(el) { const s = held.get(el); if (s) release(s); spent.delete(el); owners.delete(el) }
  return api
}

/** Хлопок пилюли el (wordLaneSnap.snapPill): её пузыри вылетают наружу → сколько вылетело (0 — пузырей нет: слабое устройство, набора не хватило) */
export const burstBubbles = el => owners.get(el)?.burst(el) ?? 0
