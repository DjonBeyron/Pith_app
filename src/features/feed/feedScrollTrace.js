// Трассировка скролла ленты — отвечает ровно на один вопрос: почему листание
// «дёргается» / «отыгрывает назад» (особенно на первых свайпах после входа).
//
// Пишет по кадру (rAF), пока лента движется: позицию, шаг за кадр, длину кадра,
// палец на экране или нет. Отдельной строкой — события, которые могут дёрнуть
// ленту: телепорт круга, смена измеренной высоты экрана (сворачивание адресной
// строки!), включение/выключение scroll-snap, смена активного слайда, смена
// длины списка. Один жест = одна строка отчёта в дебаг-панели ленты.
//
// Что ловим:
// - «отскок» (rev): шаг против направления жеста. Если он случился с поднятым
//   пальцем (revFree) — это уже не человек, а снап/инерция дерутся с кодом.
// - пропуск кадров (jank): кадр длиннее 34мс — визуально это и есть рывок.
// - перекос (align): остаток позиции по высоте слайда после остановки. Не ноль —
//   значит снап не довёл слайд до края (или высота поменялась под ногами).
// - телепорты и resize ВНУТРИ жеста — самая частая причина скачка в начале.

const MAX_EVENTS = 140
const MAX_GESTURES = 30
const MAX_STEPS = 140 // кадров подробной записи на жест
const JANK_MS = 34 // пропущенный кадр при 60fps
const REVERSE_PX = 3 // меньше — дрожание субпикселей, не отскок
const IDLE_MS = 260 // тишина после последнего события скролла = жест кончился

let el = null
let isTeleporting = () => false
const meta = { viewH: 0, len: 0, cycles: 0 }
const events = []
const gestures = []
let cur = null
let rafId = 0
let idleAt = 0
let gestureNo = 0
let touching = false

// Время в той же шкале, что и fdbg() (performance.now()/1000) — строки отчёта
// и лога ленты можно класть рядом и читать как одну хронологию
const now = () => performance.now()

export function traceMeta(patch) {
  for (const k of Object.keys(patch)) {
    if (meta[k] !== patch[k]) meta[k] = patch[k]
  }
}

export function traceTeleportFlag(fn) { isTeleporting = fn }

export function traceEvent(kind, text = '') {
  events.push({ t: now(), kind, text, top: el ? el.scrollTop : -1, sh: el ? el.scrollHeight : -1 })
  if (events.length > MAX_EVENTS) events.shift()
  if (!cur) return
  cur.marks.push(kind)
  if (kind === 'teleport') cur.teleports++
  if (kind === 'viewH') cur.resizes++
}

function begin() {
  const top = el ? el.scrollTop : 0
  cur = {
    n: ++gestureNo, t: now(), start: top, end: top, viewH0: meta.viewH,
    frames: 0, jank: 0, worstDt: 0, maxStep: 0, dir: 0,
    rev: 0, revFree: 0, revMax: 0, teleports: 0, resizes: 0,
    liftTop: null, wheel: 0, steps: [], marks: [], last: null,
  }
}

function finish() {
  if (!cur) return
  if (el) cur.end = el.scrollTop
  cur.dur = now() - cur.t
  const h = meta.viewH || 1
  cur.slides = (cur.end - cur.start) / h
  let a = ((cur.end % h) + h) % h
  if (a > h / 2) a -= h
  cur.align = a
  cur.viewH1 = meta.viewH
  cur.last = null // не держим ссылку, в отчёт не идёт
  gestures.push(cur)
  if (gestures.length > MAX_GESTURES) gestures.shift()
  cur = null
}

function sample(ts) {
  if (!cur || !el) { rafId = 0; cur = null; return }
  const top = el.scrollTop
  const prev = cur.last
  cur.last = { t: ts, top }
  cur.frames++
  if (prev) {
    const dt = ts - prev.t
    const dy = top - prev.top
    if (dt > cur.worstDt) cur.worstDt = dt
    if (dt > JANK_MS) cur.jank++
    if (Math.abs(dy) > Math.abs(cur.maxStep)) cur.maxStep = dy
    if (Math.abs(dy) >= REVERSE_PX) {
      const s = Math.sign(dy)
      if (!cur.dir) {
        cur.dir = s
      } else if (s !== cur.dir) {
        // Шаг назад во время нашего же телепорта — не баг, это перенос круга
        if (isTeleporting()) {
          cur.marks.push('tp-шаг')
        } else {
          cur.rev++
          if (!touching) cur.revFree++
          if (Math.abs(dy) > cur.revMax) cur.revMax = Math.abs(dy)
        }
      }
    }
    if (cur.steps.length < MAX_STEPS) {
      cur.steps.push({ dt: Math.round(dt), dy: Math.round(dy), f: touching ? 1 : 0 })
    }
  }
  cur.end = top
  // Палец на экране — жест не кончился, даже если пиксели стоят
  if (!touching && ts - idleAt > IDLE_MS) { finish(); rafId = 0; return }
  rafId = requestAnimationFrame(sample)
}

// Сторож старта: первые секунды после монтирования лента ездит САМА (телепорт
// init, перестройка виртуализатора, снап), пальца при этом нет — а жалоба
// именно на первые свайпы. Пишем каждое изменение позиции и, главное, каждое
// изменение scrollHeight: если общая высота списка схлопывается, браузер
// обрезает scrollTop по новому максимуму — лента прыгает к началу круга сама
const WATCH_MS = 6000
let watchUntil = 0
let watchTop = -1
let watchSh = -1
let watchId = 0

function watch(ts) {
  if (!el || ts > watchUntil) { watchId = 0; return }
  const top = el.scrollTop
  const sh = el.scrollHeight
  if (sh !== watchSh) {
    traceEvent('высота списка', `scrollH ${watchSh} → ${sh} (максимум top=${(sh - el.clientHeight).toFixed(0)})`)
    watchSh = sh
  }
  if (Math.abs(top - watchTop) >= 1) {
    // Движение без жеста и без телепорта — лента поехала сама
    if (!cur && !isTeleporting()) {
      traceEvent('САМ СДВИГ', `${watchTop.toFixed(0)} → ${top.toFixed(0)} (${((top - watchTop) / (meta.viewH || 1)).toFixed(2)} слайда)`)
    }
    watchTop = top
  }
  watchId = requestAnimationFrame(watch)
}

function startWatch() {
  if (!el) return
  watchTop = el.scrollTop
  watchSh = el.scrollHeight
  watchUntil = now() + WATCH_MS
  if (!watchId) watchId = requestAnimationFrame(watch)
}

// Зовётся из onScroll ленты на каждое событие скролла
export function traceTick() {
  if (!el) return
  idleAt = now()
  if (cur) return
  begin()
  rafId = requestAnimationFrame(sample)
}

function onDown() {
  touching = true
  traceEvent('палец↓', `top=${el ? el.scrollTop.toFixed(0) : '—'}`)
  // Палец лёг, пока предыдущий жест ещё доезжал по инерции — это уже новый
  // свайп. Раньше оба склеивались в одну строку отчёта (движение вперёд,
  // потом назад в тех же кадрах) и читались как выдуманный «отскок»
  if (cur) finish()
  begin()
  idleAt = now()
  if (!rafId) rafId = requestAnimationFrame(sample)
}

function onUp() {
  if (!touching) return
  touching = false
  idleAt = now()
  if (cur && cur.liftTop === null) cur.liftTop = cur.end
  traceEvent('палец↑', `top=${el ? el.scrollTop.toFixed(0) : '—'}`)
}

function onWheel() { if (cur) cur.wheel++ }

export function traceAttach(node) {
  if (el === node) return
  traceDetach()
  el = node
  if (!node) return
  node.addEventListener('pointerdown', onDown, { passive: true })
  node.addEventListener('pointerup', onUp, { passive: true })
  node.addEventListener('pointercancel', onUp, { passive: true })
  node.addEventListener('wheel', onWheel, { passive: true })
  traceEvent('лента смонтирована', `clientH=${node.clientHeight} scrollH=${node.scrollHeight}`)
  startWatch()
}

export function traceDetach() {
  if (!el) return
  el.removeEventListener('pointerdown', onDown)
  el.removeEventListener('pointerup', onUp)
  el.removeEventListener('pointercancel', onUp)
  el.removeEventListener('wheel', onWheel)
  cancelAnimationFrame(rafId)
  cancelAnimationFrame(watchId)
  rafId = 0
  watchId = 0
  cur = null
  touching = false
  el = null
}

// Сырые данные для отчёта (форматирование — в feedScrollReport.js)
export function scrollTraceRaw() {
  return { meta: { ...meta }, events, gestures, live: cur, touching }
}
