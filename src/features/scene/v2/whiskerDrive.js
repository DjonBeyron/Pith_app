// Усы Пита качает JS, а не CSS-анимация: каждый кадр угол четырёх .wh = амплитуда × волна, пишется в style.rotate. Амплитуда плавно идёт 0 → 1 при речи и 1 → 0 после неё (RAMP_MS, ease-in-out).
//
// Почему не CSS (v3.3.64: @property --wh-amp + переход + var() в keyframes). Chromium это рисовал плавно, а на iPhone (Safari) владелец видел «топорный» старт и конец. Safari в этой среде проверить нельзя —
// ниже правдоподобные причины, которых замер в Chromium не показал (каждая — отдельное условие отказа, а цепочка держалась на всех сразу):
//  1. var() в @keyframes WebKit раскрывает по целевому вычисленному стилю элемента, а не по значению, которое сейчас отдаёт идущий переход зарегистрированной переменной: переход --wh-amp 0 → 1 есть,
//     но keyframes его не видят — на старте амплитуда в них сразу 1 (ус рывком уходит в ±4°), в конце сразу 0 (рывком встаёт в покой);
//  2. переход шёл у потомка (.wh) по значению, поставленному на предке (.scn-cat), — наследование зарегистрированного свойства в переходах у WebKit менее надёжно, чем у Chromium;
//  3. класс → animation → переход свойства → keyframes с var(): порядок раскладки стилей в одном кадре у движков разный, любое звено отказывает по-своему.
// Здесь ничего из этого нет: ни @property, ни var() в keyframes, ни animation — только style.rotate, посчитанный в rAF. Один механизм, одинаковый везде; плавность — арифметика, а не поведение движка.
//
// Чистый модуль без React: корень (<g class="scn-cat">), время, rAF и «скролл ленты» приходят аргументами — проверяется тестами. React-обёртка для сцен — useWhiskerDrive.js; кот игры — wordLaneCatLook.js.
export const RAMP_MS = 300 // вход и выход амплитуды (полный ход 0 ↔ 1)
const MAX_DT = 64 // кадр после паузы вкладки не должен «перепрыгивать» фазу и рампу
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

/** getRoot() → <g class="scn-cat"> | null. Возвращает { set(on), stop() }: set(true) — усы выходят из покоя, set(false) — доезжают до покоя (цикл rAF сам заканчивается на нуле), stop() — всё снято сразу */
export function createWhiskerDrive({
  getRoot, now = () => globalThis.performance.now(),
  raf = f => globalThis.requestAnimationFrame(f), caf = i => globalThis.cancelAnimationFrame(i),
  reduced = reducedMotion, held = scrolling,
}) {
  let whs = [] // { el, kind, shown }
  let amp = 0, from = 0, to = 0, rampT = 0, rampD = 0 // амплитуда сейчас / откуда / куда / сколько идёт рампа / сколько длится
  let ph = 0, last = 0, id = null // фаза качания (мс), время прошлого кадра, id rAF

  const collect = () => {
    const root = getRoot()
    whs = root ? [...root.querySelectorAll('.wh')].map(el => ({ el, kind: whiskerKind(el), shown: '' })) : []
  }
  const clear = () => { for (const w of whs) { if (w.shown) w.el.style.rotate = ''; w.shown = '' } }
  const write = () => {
    for (const w of whs) {
      const v = Math.round(amp * whiskerAngle(w.kind, ph) / MIN_STEP) * MIN_STEP
      const s = v === 0 ? '' : `${v.toFixed(2)}deg`
      if (s !== w.shown) { w.el.style.rotate = s; w.shown = s }
    }
  }
  const halt = () => { if (id !== null) { caf(id); id = null } }

  function frame() {
    id = null
    const root = getRoot()
    if (!root) { amp = to = from = 0; ph = 0; return } // кот убран из DOM — цикл кончился сам
    const t = now()
    const dt = Math.min(MAX_DT, Math.max(0, t - last))
    last = t
    if (held(root)) { id = raf(frame); return } // скролл: стоим, время не идёт
    ph += dt
    if (rampD > 0) {
      rampT += dt
      const k = rampT / rampD
      amp = from + (to - from) * ease(k)
      if (k >= 1) { amp = to; rampD = 0 }
    }
    if (!whs.length || whs.some(w => !w.el.isConnected)) collect() // React пересобрал ветку лица — берём новые усы
    write()
    if (amp === 0 && to === 0) { clear(); ph = 0; return } // дошли до покоя: угол ровно 0, анимации нет — снимать нечего, рывка нет
    id = raf(frame)
  }

  return {
    /** on = true: речь (амплитуда → 1); false: покой (амплитуда → 0). Повторный вызов с тем же значением ничего не делает; смена направления посреди рампы идёт от текущей амплитуды */
    set(on) {
      const target = on ? 1 : 0
      if (on && reduced()) return
      if (target === to && (id !== null || target === 0)) return
      if (target === 0 && amp === 0 && id === null) { to = 0; return }
      from = amp; to = target; rampT = 0; rampD = RAMP_MS * Math.abs(to - from)
      if (rampD === 0) amp = to
      if (id === null) { collect(); last = now(); id = raf(frame) }
    },
    /** Конец жизни кота: цикл снят, углы сброшены сразу */
    stop() { halt(); clear(); amp = from = to = 0; rampD = 0; ph = 0 },
    /** Для тестов и отладки */
    state: () => ({ amp, to, ph, running: id !== null }),
  }
}
