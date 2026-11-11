// Пул пилюль: в разметке (WordLanePills) лежит POOL одинаковых элементов, а движок выдаёт их повторам и кускам — пилюль в ступени до девяти (три повтора × три куска), и каждая живёт
// своей жизнью (полёт, заливка, щелчок, взлёт). Элемент берётся (take) под дорожку — ему ставится дорожка (x и цвет), «тень» слова и полёт — и возвращается (give), когда пилюля ушла за край или улетела вверх.
// Запись в DOM — только при изменении значения (put): лишние записи стоили бы пересчёта стилей на слабом телефоне.
// will-change (свой композитный слой) стоит ТОЛЬКО у взятых из пула пилюль и их заливки: take ставит, give снимает. Раньше слои держали все 12 пилюль + 12 заливок + 12 меток темпа даже в пуле —
// дерево слоёв пересобиралось почти каждый кадр (Layerize), а живых пилюль в ступени до девяти.
// Слои взятой пилюли СТОЯТ неизменно от take до give: will-change ставится в take ДО старта полёта (в одном задании с записью дорожки, заливки и data-held — браузер увидит уже готовое состояние), а снимается только в give,
// когда пилюля ушла за край или сцена кончилась; в полёте его не переключает никто. data-held нужен вёрстке: по нему слою уровня, линии и тёмной подписи ставится will-change (word-lane-pill.css), чтобы начало заливки
// (data-live) дерево слоёв не пересобирало — на iOS Safari такая пересборка заставляла контур пилюли мигать.
// «Безопасный» режим слоёв (класс wl--safe на корне, wordLanePillSafe.js, для iOS): will-change не ставится вообще (слой пилюле даёт вёрстка — translateZ(0) у data-held), заливка живёт без слоёв (word-lane-pill-safe.css).
// Контур пилюли не зависит ни от одного признака пула (data-live / data-lock / data-rise): они меняют только заливку, линию уровня и пузыри; видимость контура гасит лишь data-fail («не успел»), и только в обычном режиме.
// УРОВЕНЬ ЖИДКОСТИ (v3.3.186, wordLaneLevel.js — один отсчёт): paintFill(k, v) в одном вызове пишет одно и то же v слою заливки (transform), слою уровня <i> внутри .wlPillSparks (вертикальная пилюля — тот же
// transform и тот же блок, что у заливки; широкая — translateX(v·100 %), кромка-веретено), линии уровня <b> вертикальной пилюли (scaleX по ширине поверхности — у скруглённых торцов она уже — и opacity),
// встречный сдвиг тёмному тексту поверх жидкости (.wlPillInkIn, word-lane-pill-ink.css) и тот же transform набору пузырей (wordLaneBubbles.js: набор выдаётся растущей заливке, clean убирает).
// Офсета между краем заливки, линией, светом и пузырями нет по построению. data-full — заливка дошла до 100 %: тело и клип пилюли цвета жидкости (зазора у засчитанной пилюли нет при любом округлении слоёв).
// Размер ёмкости — замер при взятии; форма сменилась (обычная ↔ широкая) — перемер при первой заливке (при взятии замер идёт до записи размеров).
// data-ring — «выдох» кольца: ставится ОДИН раз за выдачу пилюли, когда data-live появился впервые (начало заливки), и снимается в clean (take / give); после этого CSS-анимация кольца (0,75 с) не повторяется.
import { LANE_X, PILL_W, PILL_H, WIDE_W, WIDE_H } from './wordLaneTimeline.js'
import { startFlight, flightPosition } from './wordLaneMotion.js'
import { fillProfile } from './wordLaneTimeline.js'
import { flightY, startRise } from './wordLaneRise.js'
import { createLaneFlash } from './wordLaneLaneFlash.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { msToExit, addRider, coastTail } from './wordLaneCoast.js'
import { createBubbles } from './wordLaneBubbles.js'
import { fillTransform, inkTransform, levelTransform, lineAt, FULL_V } from './wordLaneLevel.js'

export const POOL = 12
export const WILL_PILL = 'transform, translate, scale' // слои взятой пилюли: полёт (translate), хлопок (scale) и дрожка промаха (transform); transform в списке — гарантия слоя там, где will-change по translate/scale слой не создаёт
export const WILL_FILL = 'transform'        // и её заливки (движок пишет ей transform каждый кадр)
// «Наливается» (data-live → пузыри покачиваются, линия уровня светится): заливка выросла за последние LIVE_HOLD_MS; у принятой пилюли (data-lock) признак держится дольше
export const LIVE_RISE_EPS = 0.0008  // рост за кадр меньше этого — шум, не «наливание»
export const LIVE_HOLD_MS = 320      // после последнего роста заливки пилюля «наливается» ещё столько мс (в кадрах роста бывают паузы)
export const LIVE_HOLD_LOCK_MS = 1200 // после принятия (data-lock) пилюля «наливается» ещё 1,2 с
const shapes = new WeakMap()         // узел пилюли → была ли широкой при прошлом взятии (узлы переживают пул: стенд пилюль пересоздаёт его на каждую цель)

export { fillTransform } from './wordLaneLevel.js' // заливка v (0…1) → transform слоя заливки

export function createPool(root) {
  const els = [...root.querySelectorAll('[data-pill]')]
  const parts = els.map(el => ({ el, clip: el.querySelector('.wlPillClip'), fill: el.querySelector('.wlPillFill'), sparks: el.querySelector('.wlPillSparks i'), line: el.querySelector('.wlPillSparks b'), ink: el.querySelector('.wlPillInkIn'), ghost: el.querySelector('.wlGhost'), bars: [...el.querySelectorAll('.wlGhost i')], pace: el.querySelector('.wlPace') }))
  const cache = new Map()
  const put = (el, prop, value) => {
    const prev = cache.get(el) ?? {}
    if (prev[prop] === value) return
    prev[prop] = value; cache.set(el, prev)
    if (prop.startsWith('--')) el.style.setProperty?.(prop, value); else el.style[prop] = value
  }
  const safe = () => root.classList?.contains?.('wl--safe') === true // «безопасный» режим слоёв (для iOS): никаких will-change
  const laneFlash = createLaneFlash(root) // вспышка дорожки на верный ответ (wordLaneLaneFlash.js)
  const free = els.map((_, i) => i).reverse()
  const live = new Map() // индекс → { anim, lane, rise }
  const rise = els.map(() => ({ v: 0, at: -1e9, on: false, ringed: false, full: false })) // для data-live: прошлая заливка, когда последний раз росла, горит ли признак, давали ли уже «выдох» кольца
  const flat = els.map(() => false)                           // ось заливки: true — широкая пилюля (слева направо, word-lane-wide-fill.css)
  const tall = els.map(() => 0)                               // высота ёмкости заливки, px (для линии уровня), замеряется при взятии
  const span = els.map(() => 0)                               // и её ширина, px (линия уровня и пузыри: где поверхность жидкости)
  const stale = els.map(() => false)                          // размер пилюли при взятии сменился (обычная ↔ широкая): замер при взятии был до записи размеров — ёмкость перемеряется при первой заливке
  const bubs = createBubbles({ off: () => isWeakDevice() || root.classList?.contains?.('wl--lite') === true })

  const measure = k => { tall[k] = parts[k].clip?.offsetHeight || 0; span[k] = parts[k].clip?.offsetWidth || 0; return tall[k] }
  // Заливка — сдвиг слоя вверх: translateY((1 − v)·100 %). Край ЕДЕТ, а не растягивается (scaleY сжимал градиент заливки). Слою уровня, линии, тёмному тексту и пузырям — то же v в том же вызове
  const paintFill = (k, v) => {
    const { el, fill, sparks, line, ink } = parts[k], wide = flat[k], f = Math.min(1, Math.max(0, v))
    put(fill, 'transform', fillTransform(f, wide))
    if (ink) put(ink, 'transform', inkTransform(f, wide))
    if (v > 0 && (stale[k] || !tall[k]) && measure(k)) stale[k] = false // замер не удался при взятии (пилюля ещё не в вёрстке) или размер сменился — один раз повторяем
    const geo = { w: span[k], h: tall[k], wide }, level = levelTransform(f, wide)
    if (sparks) put(sparks, 'transform', level)
    if (sparks && wide) put(sparks, 'opacity', Math.max(0, Math.min(1, f / 0.08, (1 - f) / 0.12)).toFixed(2)) // широкая: <i> — кромка-«веретено» над пилюлей, вне клипа (word-lane-wide-fill.css); у торцов гаснет
    else if (sparks) { put(sparks, 'opacity', ''); if (line) { const l = lineAt(f, geo); put(line, 'transform', `scaleX(${l.scale})`); put(line, 'opacity', String(l.opacity)) } }
    const r = rise[k], now = performance.now(), grew = v > r.v + LIVE_RISE_EPS
    if (grew) r.at = now
    r.v = v
    bubs.level(el, f, geo, level, grew) // пузыри — под поверхностью, едут вместе с ней; набор выдаётся растущей заливке
    if (f >= FULL_V !== r.full) { r.full = f >= FULL_V; if (r.full) el.setAttribute('data-full', '1'); else el.removeAttribute('data-full') }
    const on = v > 0 && now - r.at < (el.getAttribute('data-lock') != null ? LIVE_HOLD_LOCK_MS : LIVE_HOLD_MS)
    if (on !== r.on) {
      r.on = on
      if (on) { el.setAttribute('data-live', '1'); if (!r.ringed) { r.ringed = true; el.setAttribute('data-ring', '1') } } // «выдох» кольца — один раз за выдачу, в начале заливки
      else el.removeAttribute('data-live')
    }
  }
  const setCap = (k, text) => { const { el, ink } = parts[k]; if (text) { el.setAttribute('data-cap', text); ink?.setAttribute('data-cap', text) } else { el.removeAttribute('data-cap'); ink?.removeAttribute('data-cap') } } // подпись и её тёмная копия поверх жидкости
  const hint = (k, opacity, pace) => {
    put(parts[k].ghost, 'opacity', opacity)
    put(parts[k].pace, 'opacity', pace == null ? '0' : '0.9')
    if (pace != null) put(parts[k].pace, 'transform', `translateY(${(-pace * 100).toFixed(1)}%)`)
  }
  const clean = k => {
    Object.assign(rise[k], { v: 0, at: -1e9, on: false, ringed: false, full: false }); parts[k].el.removeAttribute('data-live'); parts[k].el.removeAttribute('data-full'); flat[k] = false; bubs.clear(parts[k].el)
    paintFill(k, 0); hint(k, '0', null); setCap(k, null)
    for (const a of ['data-lock', 'data-fail', 'data-wrong', 'data-hint', 'data-voice', 'data-rise', 'data-ring', 'data-still', 'data-tag', 'data-cmp', 'data-reveal', 'data-quiet', 'data-edge', 'data-wide', 'data-faded', 'data-hot', 'data-spent', 'data-mode', 'data-coast', 'data-pass', 'data-demo', 'data-nudge']) parts[k].el.removeAttribute(a)
  }
  /** Тень слова: ширина полосок по громкости куска слова диктора (без кривой — ровно) */
  const shape = (k, curve) => {
    const prof = fillProfile(curve, parts[k].bars.length || 10)
    parts[k].bars.forEach((b, i) => put(b, 'width', `${Math.round(30 + 60 * prof[i])}%`))
  }
  const give = k => {
    const l = live.get(k)
    if (!l) return
    for (const a of [l.anim, l.rise]) { try { a?.cancel() } catch { /* уже снята */ } }
    live.delete(k); clean(k); free.push(k)
    parts[k].el.style.willChange = ''; parts[k].fill.style.willChange = ''; parts[k].el.removeAttribute('data-held') // вернулась в пул — слои не держим
  }

  return {
    size: els.length,
    el: k => parts[k]?.el,
    paintFill, hint, shape, give,
    /** Верный ответ: дорожка lane коротко вспыхивает цветом дорожки, кромки рядом — ярче (data-win на колонке и кромках, снимается по animationend) */
    flashLane: lane => laneFlash.flash(lane),
    /** «Гонка с Питом»: упущенная пилюля не уезжает за край, а всплывает до высоты to (% экрана), держится и гаснет за ms мс — на ней успевают прочитать проявившееся слово; потом возвращается в пул сама (снимается с рук движка вызывающим) */
    linger(k, { to = 60, ms = 1700 } = {}) {
      const l = live.get(k)
      if (!l) return
      const from = l.anim ? flightY(l.anim) : to
      try { l.anim?.cancel() } catch { /* уже снята */ }
      const pos = y => ({ translate: flightPosition(y) })
      const a = parts[k].el.animate([{ ...pos(from), opacity: 1 }, { ...pos(to), opacity: 1, offset: 0.2 }, { ...pos(to), opacity: 1, offset: 0.82 }, { ...pos(to), opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'both' })
      l.anim = a; l.linger = true
      a.finished?.then(() => { if (live.get(k) === l) give(k) }).catch(() => { /* снята раньше (give / смена сцены) */ })
    },
    /** Подпись внутри пилюли (data-cap): «Гонка с Питом» — перевод, при промахе английское слово; пусто — подпись снята */
    cap: setCap,
    attr: (k, name, on = true) => { if (on) parts[k].el.setAttribute(name, on === true ? '1' : String(on)); else parts[k].el.removeAttribute(name); if (on && name === 'data-fail') bubs.clear(parts[k].el) }, // on — строка: значение атрибута (data-mode = 'say' у «Фраз»); «не успел» — набор пузырей сразу в запас
    /** Выдать пилюлю под дорожку lane; atMs — сколько мс полёта уже прошло (отрицательное — ждёт за краем). Без полёта (static) — стоит на месте. Возвращает номер или null, если пул пуст */
    take(lane, { atMs = 0, curve = null, flight = true, speed = 1, cap = null, edge = false, quiet = false, wide = false } = {}) { // wide — «Встряхни память», этап «Фразы»: широкая пилюля по центру (WIDE_W × WIDE_H, data-wide, word-lane-wide.css) — та же капсула; заливка (paintFill) — слева направо (translateX), что у обычной // speed — во сколько раз пилюля быстрее конвейера, cap — подпись внутри (data-cap), edge — у краёв экрана меньше (scale 0,85; на слабом устройстве без масштаба), quiet — промах без полос (data-quiet): «Гонка с Питом»
      const at = free.findLastIndex(j => !parts[j].el.hasAttribute?.('data-coast')) // доезжающая пилюля прошлой ступени (wordLaneCoast.js) — не наша
      if (at < 0) return null
      const [k] = free.splice(at, 1)
      const { el, fill } = parts[k]
      measure(k) // до записей: вёрстка чистая, замер дешёвый
      clean(k)
      if (!safe()) { el.style.willChange = WILL_PILL; fill.style.willChange = WILL_FILL }
      el.setAttribute('data-held', '1')
      el.dataset.lane = String(lane)
      if (speed !== 1) el.dataset.speed = String(speed); else delete el.dataset.speed // скорость пилюли «Гонки» — по ней пунктир дорожки едет быстрее (laneConveyorDrive)
      put(el, 'left', wide ? '50%' : `${LANE_X[lane]}%`); put(el, 'width', `${wide ? WIDE_W : PILL_W}%`); put(el, 'height', `${wide ? WIDE_H : PILL_H}%`)
      if (wide) { el.setAttribute('data-wide', '1'); flat[k] = true; paintFill(k, 0) } // широкая: заливка по X (пустая — слой левее клипа)
      if ((shapes.get(el) ?? false) !== wide) { shapes.set(el, wide); stale[k] = true } // форма сменилась — перемерить ёмкость после записи размеров
      shape(k, curve)
      if (cap) setCap(k, cap)
      if (quiet) el.setAttribute('data-quiet', '1')
      const scaled = edge && !isWeakDevice()
      if (scaled) el.setAttribute('data-edge', '1')
      live.set(k, { anim: flight ? startFlight(el, atMs, speed, scaled) : null, lane, rise: null })
      return k
    },
    giveAll() { for (const [k, l] of [...live]) if (!l.coast) give(k) }, // доезжающие (coast) уйдут сами
    /**
     * Ступень кончилась (wordLaneCoast.js): летящие вниз пилюли не исчезают, а доезжают до нижнего края с той же скоростью (data-coast), потом — в пул; взлетающие и «всплывшие» доигрывают свою анимацию.
     * Ещё не выехавшие и неподвижные остаются giveAll. gone(k) — пилюля доехала (журнал). Возвращает номера доезжающих.
     */
    coast(gone = () => {}) {
      const out = []
      for (const [k, l] of live) {
        if (l.coast) continue
        const ms = l.rise || l.linger ? null : msToExit(l.anim)
        if (ms == null && !l.rise && !l.linger) continue
        l.coast = true; parts[k].el.setAttribute('data-coast', '1'); out.push(k)
        if (ms == null) continue // взлёт / linger сами вернут пилюлю в пул (data-coast снимет clean)
        const off = addRider(root, l.anim)
        setTimeout(() => { off(); if (live.get(k) === l) { gone(k); give(k) } }, ms)
      }
      return out
    },
    /** Где самая верхняя доезжающая пилюля прошлой ступени (центр, %); нет — null: первая пилюля новой сцены выезжает за ней не ближе своего gap */
    tail: () => coastTail(root),
    /** «Фразы», «Скажи» (racePhraseScene.js, продление хода у края): on — полёт замирает на месте (pause), иначе едет дальше; часы полёта (y) стоят вместе с ним. Нет полёта — false */
    hold(k, on = true) { const a = live.get(k)?.anim; if (!a) return false; try { if (on) a.pause(); else a.play() } catch { return false } return true },
    /** «Фразы», демо «Скажи» (racePhraseDemoTurn.js): летящая пилюля едет дальше с другой скоростью speed (доля конвейера) — с того же места, без скачка (часы полёта currentTime не трогаются: updatePlaybackRate). Нет полёта — false */
    retime(k, speed) {
      const l = live.get(k)
      if (!l?.anim || l.rise || !(speed > 0)) return false
      try { if (l.anim.updatePlaybackRate) l.anim.updatePlaybackRate(speed); else l.anim.playbackRate = speed } catch { return false }
      parts[k].el.dataset.speed = String(speed) // пунктир дорожки — за пилюлей (laneConveyorDrive)
      return true
    },
    /** Где пилюля сейчас (центр, % высоты экрана) — по часам её полёта; не летит — null */
    y: k => (live.get(k)?.anim ? flightY(live.get(k).anim) : null),
    /** Тихо погасить пилюлю (opacity за ms) и вернуть в пул */
    fade(k, ms = 280) {
      const l = live.get(k)
      if (!l) return
      const a = parts[k].el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' })
      if (!a) { give(k); return }
      a.finished?.then(() => { if (live.get(k) === l) { try { a.cancel() } catch { /* уже снята */ } give(k) } }).catch(() => { /* снята раньше */ })
    },
    /**
     * Взлёт принятой пилюли: полёт вниз снимается (положение — по его часам), заливка доводится до края, через RISE_DELAY_MS пилюля улетает вверх (wordLaneRise.js); когда взлёт кончился — give.
     * Пилюля после этого вне логики конвейера (в игре ученика движок отпускает её из своих рук). Возвращает анимацию или null, если взлетать нечему (нет полёта, уже взлетела, не выдана).
     */
    rise(k) {
      const l = live.get(k)
      if (!l?.anim || l.rise) return null
      const a = startRise(parts[k].el, flightY(l.anim))
      try { l.anim.cancel() } catch { /* уже снята */ }
      l.anim = null; l.rise = a
      parts[k].el.setAttribute('data-rise', '1')
      paintFill(k, 1)
      a.finished?.then(() => { if (live.get(k)?.rise === a) give(k) }).catch(() => { /* снята раньше (give / смена сцены) */ })
      return a
    },
    /** Поставить пилюлю в центр дорожки без полёта (раунд «Порядок») */
    place(k, y) { put(parts[k].el, 'translate', `-50% calc(${y}dvh - 50%)`) },
    unplace(k) { parts[k].el.style.translate = ''; cache.get(parts[k].el) && delete cache.get(parts[k].el).translate },
    anims: () => [...live.values()].map(l => l.anim).filter(Boolean),
  }
}
