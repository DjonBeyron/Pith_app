// Усы Пита качает JS, а не CSS-анимация: каждый кадр угол четырёх .wh = амплитуда × волна. Записывается он одним из трёх способов (whiskerWrite.js: rotate / transform / attr — выбирается в HUD игры). Амплитуда плавно идёт 0 → 1 при речи и 1 → 0 после неё (RAMP_MS, ease-in-out).
//
// Почему не CSS (v3.3.64: @property --wh-amp + переход + var() в keyframes). Chromium это рисовал плавно, а на iPhone (Safari) владелец видел «топорный» старт и конец. Safari в этой среде проверить нельзя —
// ниже правдоподобные причины, которых замер в Chromium не показал (каждая — отдельное условие отказа, а цепочка держалась на всех сразу):
//  1. var() в @keyframes WebKit раскрывает по целевому вычисленному стилю элемента, а не по значению, которое сейчас отдаёт идущий переход зарегистрированной переменной;
//  2. переход шёл у потомка (.wh) по значению, поставленному на предке (.scn-cat), — наследование зарегистрированного свойства в переходах у WebKit менее надёжно, чем у Chromium;
//  3. класс → animation → переход свойства → keyframes с var(): порядок раскладки стилей в одном кадре у движков разный, любое звено отказывает по-своему.
// Здесь ничего из этого нет: ни @property, ни var() в keyframes, ни animation — только угол, посчитанный в rAF. Плавность — арифметика, а не поведение движка.
//
// Что ещё могло давать рывок, которого не видно в трассах Chromium (v3.3.71), и как закрыто:
//  • stop() снимал угол МГНОВЕННО — это и есть «топорно встают» в конце, когда кота выключали посреди речи (сцена: live → false; смена стадии). Теперь stop() мягкий: амплитуда идёт к нулю, потом угол снимается; жёсткий — dispose() (размонтирование);
//  • амплитуда считалась по кадрам (dt ≤ 64 мс): при 30 fps и паузах rAF в Safari (фон, экономия заряда) она шагала крупно. Теперь по реальному времени (метка кадра rAF — ровная, без дрожи performance.now() внутри кадра), а шаг угла за кадр ограничен MAX_STEP;
//  • записанный угол, если способ записи сменили на ходу (HUD), сначала снимается прежним способом и тут же пишется новым — в том же кадре, пустого кадра нет;
//  • два привода на одних усах (старый ещё доезжал, а новый стартовал) давали двойное движение: новый привод забирает усы у прежнего.
// Старт: волна при фазе 0 стоит на пике (±4°), но амплитуда там 0 и растёт smoothstep'ом — вход мягкий. Повторный set(true) (каждая реплика, lineStart, каждое слово) рампу и фазу не трогает.
//
// Чистый модуль без React: корень (<g class="scn-cat">), время, rAF, режим записи и «скролл ленты» приходят аргументами — проверяется тестами. React-обёртка для сцен — useWhiskerDrive.js; кот игры — wordLaneCatLook.js.
import { getWhiskerMode, whiskerWriter } from './whiskerWrite.js'

export const RAMP_MS = 300 // вход и выход амплитуды (полный ход 0 ↔ 1)
const MAX_DT = 64 // фаза качания за кадр не уходит дальше 64 мс (после паузы вкладки волна продолжается, а не перепрыгивает); амплитуда идёт по реальному времени
export const MAX_STEP = 1.2 // угол уса за кадр меняется не больше чем на 1,2°: при 30 fps и пропуске кадров в Safari нет скачка (на 60 fps волна даёт ≤ 0,6° за кадр, ограничение не работает)
const MIN_STEP = 0.01 // угол пишем с точностью 0,01°: меньше глазом не видно, лишних записей в DOM нет

// Форма движения — та же, что была в keyframes scnWhiskL / scnWhiskR (левые 4° → −3° → 4°, правые зеркально; нижние — период 0,72 с и сдвиг 0,25 с), cos вместо ease-in-out по сегментам
const SHAPE = { l: { c: 0.5, a: 3.5 }, r: { c: -0.5, a: -3.5 } } // угол = c + a·cos(фаза)
const UP = { period: 600, shift: 0 }
const LOW = { period: 720, shift: 250 }

/** Класс .wh → { side: 'l' | 'r', low } (wh-l / wh-r, wh-u / wh-d) */
export function whiskerKind(el) {
  const cl = el.classList
  return { side: cl.contains('wh-r') ? 'r' : 'l', low: cl.contains('wh-d') }
}

/** Угол уса в градусах при амплитуде 1 через ph мс после начала речи; при ph = 0 верхние усы в крайней точке (±4°) — амплитуда к этому моменту уже ≈ 0, скачка нет */
export function whiskerAngle(kind, ph) {
  const s = SHAPE[kind.side]
  const t = kind.low ? LOW : UP
  return s.c + s.a * Math.cos((2 * Math.PI * (ph + t.shift)) / t.period)
}

/** Плавный ход 0…1 → 0…1 с нулевой скоростью на обоих концах (замена CSS ease-in-out) */
export const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

const reducedMotion = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false } }
// Прокрутка ленты сцен ([data-scrolling="1"] у родителя): усы замирают на месте, как раньше animation-play-state: paused — рамп и фаза стоят
const scrolling = root => { try { return !!root.closest?.('[data-scrolling="1"]') } catch { return false } }
const owners = new WeakMap() // корень → привод, который им сейчас владеет

/** getRoot() → <g class="scn-cat"> | null. Возвращает { set(on), stop(), dispose() }: set(true) — усы выходят из покоя, set(false) — доезжают до покоя (цикл rAF сам заканчивается на нуле), stop() — то же мягко
 *  (кота выключили), dispose() — всё снято сразу (узел уходит из DOM). mode() → 'rotate' | 'transform' | 'attr' — способ записи угла, читается каждый кадр (смена в HUD действует сразу) */
export function createWhiskerDrive({
  getRoot, now = () => globalThis.performance.now(), mode = getWhiskerMode,
  raf = f => globalThis.requestAnimationFrame(f), caf = i => globalThis.cancelAnimationFrame(i),
  reduced = reducedMotion, held = scrolling,
}) {
  let whs = [] // { el, kind, shown (что записано: число | null), cur (угол сейчас), anchor, armed }
  let amp = 0, from = 0, to = 0, rampAt = 0, rampD = 0 // амплитуда сейчас / откуда / куда / когда началась рампа / сколько длится
  let ph = 0, last = 0, id = null // фаза качания (мс), время прошлого кадра, id rAF
  let modeName = '', writer = null

  const collect = () => {
    const root = getRoot()
    whs = root ? [...root.querySelectorAll('.wh')].map(el => ({ el, kind: whiskerKind(el), shown: null, cur: 0 })) : []
  }
  const clearAll = () => { if (writer) for (const w of whs) { if (w.shown !== null || w.armed) writer.clear(w); w.shown = null; w.cur = 0 } }
  const reset = () => { clearAll(); amp = from = to = 0; rampD = 0; ph = 0 }
  const halt = () => { if (id !== null) { caf(id); id = null } }
  // Способ записи сменили (HUD): прежнюю запись снимаем прежним способом и тут же пишем новым — в том же кадре; текущие углы сохраняются
  const syncMode = () => {
    const m = mode()
    if (m === modeName && writer) return
    if (writer) for (const w of whs) { if (w.shown !== null || w.armed) writer.clear(w); w.shown = null }
    modeName = m; writer = whiskerWriter(m)
  }
  // Метка кадра rAF ровнее performance.now() внутри кадра (нет дрожи от нагрузки основного потока); если часы разошлись (старый WebView) — now()
  const frameTime = ts => { const n = now(); return Number.isFinite(ts) && Math.abs(ts - n) < 1000 ? ts : n }
  // Идём к цели не быстрее MAX_STEP за кадр; возвращает true, когда все усы в покое (угол 0 и записи нет)
  const write = () => {
    let calm = true
    for (const w of whs) {
      const target = amp * whiskerAngle(w.kind, ph)
      w.cur += Math.max(-MAX_STEP, Math.min(MAX_STEP, target - w.cur))
      const v = Math.round(w.cur / MIN_STEP) * MIN_STEP
      if (v === 0) { if (w.shown !== null || w.armed) { writer.clear(w); w.shown = null } continue }
      calm = false
      if (v !== w.shown && writer.apply(w, v)) w.shown = v
    }
    return calm
  }

  function frame(ts) {
    id = null
    const root = getRoot()
    if (!root || root.isConnected === false) { whs = []; amp = from = to = 0; rampD = 0; ph = 0; return } // кота убрали из DOM — цикл кончился сам
    const t = frameTime(ts)
    const dt = Math.max(0, t - last)
    last = t
    if (held(root)) { rampAt += dt; id = raf(frame); return } // скролл: стоим, время не идёт
    ph += Math.min(MAX_DT, dt)
    if (rampD > 0) {
      const k = (t - rampAt) / rampD
      amp = from + (to - from) * ease(k)
      if (k >= 1) { amp = to; rampD = 0 }
    }
    if (!whs.length || whs.some(w => !w.el.isConnected)) collect() // React пересобрал ветку лица — берём новые усы
    syncMode()
    const calm = write()
    if (amp === 0 && to === 0 && calm) { clearAll(); ph = 0; return } // дошли до покоя: угол ровно 0, запись снята — рывка нет
    id = raf(frame)
  }

  const api = {
    /** on = true: речь (амплитуда → 1); false: покой (амплитуда → 0). Повторный вызов с тем же значением ничего не делает (рампа и фаза не перезапускаются); смена направления посреди рампы идёт от текущей амплитуды */
    set(on) {
      const target = on ? 1 : 0
      if (on && reduced()) return
      if (target === to && (id !== null || target === 0)) return
      if (target === 0 && amp === 0 && id === null) { to = 0; return }
      const root = getRoot()
      const prev = root && owners.get(root)
      if (on && prev && prev !== api) prev.dispose() // усы у прежнего привода забираем: двух качающих сразу быть не должно
      if (on && root) owners.set(root, api)
      from = amp; to = target; rampAt = now(); rampD = RAMP_MS * Math.abs(to - from)
      if (rampD === 0) amp = to
      if (id === null) { collect(); last = rampAt; id = raf(frame) }
    },
    /** Кота выключили (стадия сменилась, сцена кончилась): мягко — амплитуда идёт к нулю, потом угол снят. Узел уже вне DOM — снимаем сразу */
    stop() { const root = getRoot(); if (!root || root.isConnected === false) api.dispose(); else api.set(false) },
    /** Конец жизни кота: цикл снят, углы сброшены сразу */
    dispose() { halt(); reset(); whs = [] },
    /** Для тестов и отладки */
    state: () => ({ amp, to, ph, running: id !== null, mode: modeName }),
  }
  return api
}
