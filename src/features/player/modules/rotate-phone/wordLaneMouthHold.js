// Выдержка формы рта кота (чистая логика без DOM — время, таймеры и «нарисовать» приходят аргументами, проверяется тестами).
// Громкость голоса и дорожка букв меняют просьбу о форме до 60 раз в секунду, а каждая смена — запись четырёх атрибутов d в SVG (пересчёт стилей и перерисовка). Здесь:
//  • форма держится не меньше MOUTH_MIN_HOLD_MS (70 мс — как MIN_HOLD в scene/v2/mouthVisemes.js): раньше успеть сменить — не даём, новая форма ждёт и рисуется по таймеру, если просьб больше нет
//    (иначе рот «застрял» бы открытым после последнего кадра);
//  • та же форма, что уже нарисована, — DOM не трогаем вовсе (и ждущая просьба отменяется, если просят вернуться к показанной).
export const MOUTH_MIN_HOLD_MS = 70

/** apply(key) рисует форму; key — closed / half / open или код Rhubarb (одна заглавная буква). initial — что нарисовано при создании */
export function createMouthHold({ apply, initial = 'closed', minHold = MOUTH_MIN_HOLD_MS, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let shown = initial
  let shownAt = -Infinity
  let want = null // просьба, которая ждёт конца выдержки
  let timer = 0
  const stopTimer = () => { if (timer) { clearTimer(timer); timer = 0 } }
  const commit = key => { shown = key; shownAt = now(); want = null; apply(key) }
  const flush = () => { timer = 0; if (want != null && want !== shown) commit(want); else want = null }
  return {
    set(key) {
      if (key === shown) { want = null; stopTimer(); return }
      const wait = shownAt + minHold - now()
      if (wait <= 0) { stopTimer(); commit(key); return }
      want = key
      if (!timer) timer = setTimer(flush, wait)
    },
    /** Нарисовать показанную форму заново (в DOM другая «голова» — смена лица) */
    redraw() { apply(shown) },
    shown: () => shown,
    dispose() { stopTimer(); want = null },
  }
}
