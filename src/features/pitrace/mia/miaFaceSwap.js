// Смена лица Мии через моргание (владелец, v3.3.288: по кадрам 220→221 и 288→289 «слишком большой скачок глаз, будто рваное дёрганье»): раньше голова лица А просто скрывалась, голова Б показывалась,
// и глаза за один кадр прыгали от прищуренных «пафоса» к круглым «интереса». Перекрёстное проявление (владелец 2026-11-14) давало двойной контур, поэтому по-прежнему никакого наложения: старые глаза
// быстро смыкаются (scaleY до щели, BLINK_CLOSE_MS), на сомкнутых глазах головы подменяются жёстко (контуры не видны), новые глаза раскрываются (BLINK_OPEN_MS) — смена читается как обычное моргание.
export const BLINK_CLOSE_MS = 70
export const BLINK_OPEN_MS = 110
const SQUASH = 'scaleY(0.06)'
const eyesOf = head => head?.querySelector('.cat-eyes') ?? null
const prep = el => { el.style.transformBox = 'fill-box'; el.style.transformOrigin = '50% 50%' }

/** prev / next — головы (<g data-part="head">), later(fn, ms) — таймер владельца (чистится при уходе Мии), done() — после подмены голов (обновить текущее лицо и рот) */
export function swapFace(prev, next, { later, done }) {
  const pe = eyesOf(prev), ne = eyesOf(next)
  if (!pe || !ne) { next.style.display = ''; prev.style.display = 'none'; done(); return }
  prep(pe); prep(ne)
  pe.style.transition = `transform ${BLINK_CLOSE_MS}ms ease-in`; pe.style.transform = SQUASH
  later(() => {
    next.style.display = ''; prev.style.display = 'none' // глаза уже сомкнуты: подмена голов не видна
    pe.style.transition = 'none'; pe.style.transform = ''
    ne.style.transition = 'none'; ne.style.transform = SQUASH
    void ne.getBoundingClientRect() // применить сомкнутое состояние до перехода
    ne.style.transition = `transform ${BLINK_OPEN_MS}ms ease-out`; ne.style.transform = ''
    done()
  }, BLINK_CLOSE_MS + 6)
}
