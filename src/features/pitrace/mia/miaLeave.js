// Уход Мии после трёх верных подряд (useRaceActs): директор идёт к следующему этапу не раньше MIA.LEAVE_JUMP_MS и ТОЛЬКО когда договорили реплики ухода (Мия «ах так, ладно», Пит «спасибо за помощь», «постарайся не ошибаться»):
// следующий этап (разворот в реверс, плашка) не должен накладываться на них и перебивать (владелец 2026-11-17). Чистая функция: время и очередь речи — аргументами.
export const LEAVE_POLL_MS = 150
export const LEAVE_MAX_POLLS = 120 // страховка: ≈ 18 с, дальше идём в любом случае

/** → cancel(). pending() — сколько реплик ещё в очереди речи (mspeech.pending), go() — идти дальше */
export function afterLeaveSpeech({ pending, delay, go, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let t = 0, n = 0
  const poll = () => { if (pending() > 0 && n++ < LEAVE_MAX_POLLS) { t = setTimer(poll, LEAVE_POLL_MS); return } go() }
  t = setTimer(poll, delay)
  return () => clearTimer(t)
}
