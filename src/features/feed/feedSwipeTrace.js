// Трассировка ленты на Swiper: что происходило с листанием и где сломалось.
// Заменяет прежний трассировщик нативного скролла (кадры scrollTop, snap,
// телепорты) — всех тех механизмов больше нет, лента двигается transform'ом.
//
// Пишем события Swiper (палец, смена слайда, анимация, resize) и события
// самой ленты (перенос круга, пересборка, ушла/вернулась на экран). Сразу же
// ловим аномалии — их и смотрят в первую очередь (в отчёте и в «обезьяне»):
//   ПОЛЁТ      — 3 смены слайда подряд в одну сторону быстрее 100мс: руками
//                так не листают, лента щёлкает сама;
//   ПРОСКОК    — одна смена больше чем на слайд не нашим переносом;
//   ПЕРЕКОС    — анимация закончилась, а лента стоит не ровно на слайде;
//   ЗАВИСАНИЕ  — анимация началась и не закончилась за разумное время;
//   СКРЫТАЯ ПОЕХАЛА — лента сменила слайд, пока её не видно.

const MAX_EVENTS = 250
const FLIGHT_GAP_MS = 100
const FLIGHT_STEPS = 3
const STUCK_MS = 1500

const events = []
const counts = {}
let sw = null
let visible = true
let lastChangeT = -Infinity
let lastDir = 0
let flightRun = 0
let touchStartT = 0
let stuckTimer = 0
// Наш собственный переход (перенос круга, пересборка): Swiper шлёт на него
// обычный slideChange — без пометки он читался бы как ПРОСКОК на 95 слайдов
let programmatic = null

const now = () => performance.now()

export function swipeEvent(kind, text = '', anomaly = false) {
  const e = { t: now(), kind, text, idx: sw ? sw.activeIndex : -1, anomaly }
  const last = events[events.length - 1]
  // Одинаковые события подряд (resize при повороте, серии анимаций) — одной строкой
  if (last && last.kind === kind && last.text === text && e.t - last.t < 1000) {
    last.n = (last.n || 1) + 1
    last.t = e.t
    return
  }
  events.push(e)
  if (events.length > MAX_EVENTS) events.shift()
  if (anomaly) counts[kind] = (counts[kind] || 0) + 1
}

function bump(key) { counts[key] = (counts[key] || 0) + 1 }

// Лента стоит ровно на слайде? Сколько пикселей мимо (с учётом Virtual)
export function swiperMisalign(s) {
  if (!s || s.destroyed || !s.slidesGrid) return 0
  const want = s.slidesGrid[s.activeIndex] ?? 0
  return Math.abs(-s.translate - want)
}

// Программный переход ленты: slideTo без анимации внутри fn
export function swipeProgrammatic(why, fn) {
  programmatic = why
  try { fn() } finally { programmatic = null }
}

function onSlideChange(s) {
  const t = now()
  const delta = s.activeIndex - s.previousIndex
  const dir = Math.sign(delta)
  if (programmatic) {
    swipeEvent(programmatic, `${s.previousIndex} → ${s.activeIndex}`)
    lastDir = 0
    flightRun = 0
    return
  }
  bump('смен слайда')
  if (!visible) swipeEvent('СКРЫТАЯ ПОЕХАЛА', `${s.previousIndex} → ${s.activeIndex}`, true)
  if (Math.abs(delta) > 1) swipeEvent('ПРОСКОК', `${s.previousIndex} → ${s.activeIndex} (${delta} слайдов)`, true)
  const chained = Math.abs(delta) === 1 && dir === lastDir && t - lastChangeT < FLIGHT_GAP_MS
  flightRun = chained ? flightRun + 1 : 1
  if (flightRun === FLIGHT_STEPS) swipeEvent('ПОЛЁТ', `${FLIGHT_STEPS} смены подряд быстрее ${FLIGHT_GAP_MS}мс (до ${s.activeIndex})`, true)
  lastChangeT = t
  lastDir = Math.abs(delta) === 1 ? dir : 0
  swipeEvent('слайд', `${s.previousIndex} → ${s.activeIndex} через ${Math.min(99999, t - touchStartT).toFixed(0)}мс после касания`)
}

function onTransitionStart() {
  clearTimeout(stuckTimer)
  stuckTimer = setTimeout(() => {
    if (sw && sw.animating) swipeEvent('ЗАВИСАНИЕ', `анимация идёт дольше ${STUCK_MS}мс, слайд ${sw.activeIndex}`, true)
  }, STUCK_MS)
}

function onTransitionEnd(s) {
  clearTimeout(stuckTimer)
  const off = swiperMisalign(s)
  if (off > 1) swipeEvent('ПЕРЕКОС', `слайд ${s.activeIndex}: мимо на ${off.toFixed(1)}px`, true)
}

function onTouchStart() { touchStartT = now(); bump('касаний') }

function onTouchEnd(s) {
  const diff = s.touches ? s.touches.diff : 0
  const ms = now() - touchStartT
  if (Math.abs(diff) < 6) { bump('тапов'); return }
  bump('свайпов')
  swipeEvent('палец', `${diff > 0 ? 'вниз' : 'вверх'} ${Math.abs(diff).toFixed(0)}px за ${ms.toFixed(0)}мс`)
}

function onResize(s) { swipeEvent('resize', `высота ${s.size}px, слайд ${s.activeIndex}`) }

const HANDLERS = {
  slideChange: onSlideChange, transitionStart: onTransitionStart, transitionEnd: onTransitionEnd,
  touchStart: onTouchStart, touchEnd: onTouchEnd, resize: onResize,
}

export function swipeTraceAttach(s) {
  if (sw === s) return
  swipeTraceDetach()
  sw = s
  for (const [ev, fn] of Object.entries(HANDLERS)) s.on(ev, fn)
  swipeEvent('лента смонтирована', `высота ${s.size}px, слайдов ${s.virtual?.slides?.length ?? s.slides.length}, слайд ${s.activeIndex}`)
}

export function swipeTraceDetach() {
  if (!sw) return
  if (!sw.destroyed) for (const [ev, fn] of Object.entries(HANDLERS)) sw.off(ev, fn)
  clearTimeout(stuckTimer)
  sw = null
}

export function swipeTraceVisible(v) { visible = v }

export function swipeTraceRaw() {
  return { events, counts: { ...counts }, swiper: sw }
}
