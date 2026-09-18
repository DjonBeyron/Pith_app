import { pLog, isTraceOn } from '../../shared/lib/debug.js'

// Покадровая трасса прилёта сообщения В ОТКРЫТУЮ ПАНЕЛЬ (подсказка/сигнал
// над таблицей): глазом видно микро-опускание истории на несколько пикселей
// в самом начале анимации. Участников, которые могут его дать, несколько,
// и трасса разводит их по столбцам:
//   · опора — последнее СТАРОЕ сообщение (то, что визуально «дёргается»):
//     его top с сотыми долями и Δ от кадра к кадру. FLIP обязан первым же
//     кадром вернуть его ровно на старое место (top до вставки + 0.00);
//   · сдвиг по FLIP (shiftPx) считается из offsetHeight — ЦЕЛОЕ, а реальная
//     высота пузыря дробная (в логах rect=57.23): разница и есть кандидат;
//   · scrollTop ленты — вставка меняет scrollHeight, и браузер может
//     подвинуть якорь прокрутки (scroll anchoring);
//   · запас ленты и распорки — если они меняются в этот же кадр;
//   · transform опоры и inner — чей трансформ в кадре реально применён.
const FRAMES = 14

function spacers() {
  return [...document.querySelectorAll('[class*="Spacer"]')]
    .map(el => `${el.className.split(' ')[0]}=${el.getBoundingClientRect().height.toFixed(1)}`)
    .join(',') || '—'
}

// ty из computed transform (matrix(a, b, c, d, tx, ty)) — чтобы отделить
// раскладку от анимации: getBoundingClientRect трансформ уже включает
export function translateYOf(el) {
  const t = el ? getComputedStyle(el).transform : 'none'
  if (!t || t === 'none') return 0
  const m = t.match(/matrix\(([^)]+)\)/)
  return m ? parseFloat(m[1].split(',')[5]) : 0
}
const tf = el => translateYOf(el).toFixed(2)

// anchor — последнее старое сообщение, fresh — новое, oldTop — top опоры до
// вставки (последний замер PlayerFeed, см. lastTopRef), shiftPx — на сколько
// FLIP отбрасывает историю назад
export function traceSlideIn({ anchor, fresh, old, shiftPx }) {
  const oldTop = old?.top ?? null
  const oldTopAgeMs = old ? Math.round(performance.now() - old.at) : null
  const sameEl = old ? old.el === anchor : false
  if (!isTraceOn() || !anchor) return
  const outer = document.querySelector('.playerFeed')
  const inner = document.querySelector('.playerFeedInner')
  const t0 = performance.now()
  // Минус FLIP-трансформ (fill: backwards уже применён): чистая раскладка
  const now = anchor.getBoundingClientRect().top - translateYOf(anchor)
  pLog(`[slide-in] старт: опора top ДО вставки=${oldTop != null ? oldTop.toFixed(2) : '—'} (глазом ${old?.raw != null ? old.raw.toFixed(2) : '—'}${sameEl ? '' : ', ⚠ ДРУГОЙ ЭЛЕМЕНТ'})`
    + ` (замер ${oldTopAgeMs}мс назад), ПОСЛЕ раскладки=${now.toFixed(2)}`
    + ` (реальный сдвиг ${oldTop != null ? (oldTop - now).toFixed(2) : '—'}, FLIP вернёт на ${shiftPx})`
    + `${oldTop != null && Math.abs(oldTop - now - shiftPx) > 0.5 ? ' ⚠ FLIP НЕ СОВПАДАЕТ С РЕАЛЬНЫМ СДВИГОМ' : ''}`
    + ` | scrollTop=${outer?.scrollTop ?? '—'} | распорки=[${spacers()}]`)
  let n = 0
  let prev = null
  const tick = () => {
    const ms = Math.round(performance.now() - t0)
    const a = anchor.getBoundingClientRect().top
    const f = fresh?.getBoundingClientRect().top
    const d = prev == null ? 0 : a - prev
    prev = a
    const pad = outer ? parseFloat(getComputedStyle(outer).paddingTop) : 0
    pLog(`[slide-in] +${ms}мс кадр${n}`
      + ` | опора top=${a.toFixed(2)}${d ? ` (${d > 0 ? '+' : ''}${d.toFixed(2)}${d > 0 ? ' ↓ВНИЗ' : ''})` : ''}`
      + ` от старого ${oldTop != null ? (a - oldTop >= 0 ? '+' : '') + (a - oldTop).toFixed(2) : '—'}`
      + ` глазом от прошлого кадра ${old?.raw != null ? (a - old.raw >= 0 ? '+' : '') + (a - old.raw).toFixed(2) : '—'}${old?.raw != null && a - old.raw > 0.5 ? ' ↓' : ''}`
      + ` | новое top=${f != null ? f.toFixed(2) : '—'}`
      + ` | tf опоры=${tf(anchor)} inner=${tf(inner)}`
      + ` | scrollTop=${outer?.scrollTop ?? '—'} запас=${pad.toFixed(1)} | распорки=[${spacers()}]`)
    if (++n < FRAMES) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// Следим за опорой КАЖДЫЙ кадр (только в режиме трейса): «старое место» для
// трассы — ровно предыдущий кадр перед вставкой, а не замер PlayerFeed
// многосекундной давности (в логе было «замер 7737мс назад» — до того как
// распорка подняла историю, сравнивать не с чем). raw — что видит глаз
// (с трансформами), layout — чистая раскладка. Возвращает стоп.
export function watchLastTop(inner, ref) {
  if (!isTraceOn() || !inner) return () => {}
  let raf = 0
  const tick = () => {
    const rows = [...inner.querySelectorAll('.playerMsgRow')].filter(el => !el.closest('[data-pending]'))
    const last = rows[rows.length - 1]
    if (last) {
      const top = last.getBoundingClientRect().top
      ref.current = { top: top - translateYOf(last), raw: top, at: performance.now(), el: last }
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
