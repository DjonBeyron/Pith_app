// Экзамен «Шкала памяти»: линия шкалы и треугольник слова едут ТЕМ ЖЕ приводом, что пилюля (владелец 2026-11-26, слабый Android: «горизонтальная линия под пилюлей не кадр в кадр попадает при опускании»).
// Причина была в двух разных приводах: пилюлю везёт композитор (WAAPI-полёт свойства translate, wordLaneMotion.js — от лагов основного потока он не зависит), а линию писал JS раз в кадр по замеру рамки пилюли.
// Кадр основного потока опоздал (на том устройстве ≈ 43 кадра/с, кадры до 300 мс) — пилюля уехала, линия стояла, потом догоняла рывком. Теперь у линии (и у треугольника слова в работе) своя WAAPI-анимация
// translate по тому же пути и С ТЕМИ ЖЕ ЧАСАМИ, что у полёта пилюли (startTime и playbackRate — копия; пауза и смена скорости переносятся в том же кадре): оба слоя считает композитор из одного времени,
// расхождения нет по построению. JS по кадрам больше не пишет положение — только сверяет постоянный сдвиг «низ пилюли − её центр» (transform, пишется, когда сменился: масштаб пилюли у краёв).
// Путь обрезан у низа шкалы (линия дальше не идёт). Среда без WAAPI (тесты) — follow не включается, шкала пишет положение по кадрам, как раньше.
import { ENTER_Y, EXIT_Y } from '../../player/modules/rotate-phone/wordLaneTimeline.js'
import { FLIGHT_MS, ANIM_MS } from '../../player/modules/rotate-phone/wordLaneMotion.js'
import { flightY } from '../../player/modules/rotate-phone/wordLaneRise.js'
import { viewHeightPx } from '../../player/modules/rotate-phone/wordLaneWave.js'

export const K_EPS = 0.25 // сдвиг переписывается, когда ушёл больше чем на столько px

/** Полёт пилюли вниз (анимация wordLaneMotion.startFlight) или null: его узнаём по длине ANIM_MS */
export const flightOf = el => { try { return el.getAnimations?.().find(a => a.playState !== 'idle' && a.effect?.getTiming?.().duration === ANIM_MS) ?? null } catch { return null } }

/** Кадры ведомого: тот же путь, что у пилюли (ENTER_Y → EXIT_Y, % высоты экрана), но не ниже низа шкалы: k — сдвиг «низ пилюли − центр × высота экрана», px от верха шкалы; H — длина шкалы, vh — высота экрана, px */
export function followFrames(k, H, vh) {
  const yH = Math.min(EXIT_Y, Math.max(ENTER_Y, ((H - k) * 100) / vh)), pos = y => `0 ${y.toFixed(3)}dvh`
  return [{ translate: pos(ENTER_Y), offset: 0 }, { translate: pos(yH), offset: ((yH - ENTER_Y) / (EXIT_Y - ENTER_Y)) * (FLIGHT_MS / ANIM_MS) }, { translate: pos(yH), offset: 1 }]
}

/** Часы ведомого a — копия часов полёта src: та же скорость, тот же старт; полёт стоит (пауза, продление хода) или ещё не запущен — ведомый стоит в том же месте */
export function mirror(a, src) {
  try {
    if (a.playbackRate !== src.playbackRate) a.playbackRate = src.playbackRate
    const st = src.startTime
    if (st != null && src.playState === 'running') { if (a.startTime !== st) a.startTime = st; return }
    if (a.playState !== 'paused') a.pause()
    const t = src.currentTime
    if (t != null && Math.abs((Number(a.currentTime) || 0) - t) > 0.01) a.currentTime = t
  } catch { /* анимация уже снята */ }
}

export function createFollower() {
  let src = null, pill = null, k = 0, H = 0, vh = 812, frames = null, items = []
  const put = el => { el.style.transform = `translate3d(0, ${k.toFixed(1)}px, 0)` }
  const off = i => { try { i.anim.cancel() } catch { /* уже снята */ } i.el.style.transform = '' }
  const api = {
    on: () => !!src,
    pill: () => pill,
    has: el => items.some(i => i.el === el),
    /** Взять пилюлю el с полётом fa: bottom — её низ сейчас, px от верха шкалы; h — длина шкалы */
    start(el, fa, bottom, h) { api.release(); src = fa; pill = el; H = h; vh = viewHeightPx(); k = bottom - (flightY(fa) * vh) / 100; frames = followFrames(k, H, vh) },
    /** Узел едет за пилюлей (линия, треугольник слова) */
    add(el) { if (!src || api.has(el) || typeof el.animate !== 'function') return; const anim = el.animate(frames, { duration: ANIM_MS, easing: 'linear', fill: 'both' }); items.push({ el, anim }); put(el); mirror(anim, src) },
    drop(el) { const i = items.find(x => x.el === el); if (!i) return; off(i); items = items.filter(x => x !== i) },
    /** Кадр: сверить сдвиг по замеру низа пилюли и часы. → false: полёта больше нет (снят) */
    step(bottom) {
      if (!src || src.playState === 'idle') return false
      if (bottom < H) { const nk = bottom - (flightY(src) * vh) / 100; if (Math.abs(nk - k) > K_EPS) { k = nk; items.forEach(i => put(i.el)) } }
      api.sync(); return true
    },
    sync() { if (src) items.forEach(i => mirror(i.anim, src)) },
    /** Где низ пилюли сейчас по часам её полёта, px от верха шкалы (без чтения вёрстки); полёта нет — null */
    y: () => (src && src.playState !== 'idle' && src.currentTime != null ? (flightY(src) * vh) / 100 + k : null),
    release() { items.forEach(off); items = []; src = null; pill = null },
  }
  return api
}
