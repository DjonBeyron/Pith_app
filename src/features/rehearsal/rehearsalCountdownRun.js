import { startCountdown } from './rehearsalCountdownSound.js'

// Запуск отсчёта стадии и ожидание его конца (директор актов — useRehearsalActs.js). Раньше ноты стартовали по таймеру «реплика + пауза», а стадия кончалась по другому таймеру (holdMs): если Пит договаривал дольше расчёта
// (озвучка ждала слот до LINE_WAIT_MS) или ноты стартовали поздно, стадия могла смениться, не доиграв отсчёт. Теперь:
//  • отсчёт стартует, когда Пит РЕАЛЬНО договорил (busyLeft() = 0), но не позже cap мс после планового момента (иначе тишина насовсем);
//  • createCountGate: пока отсчёт запланирован или идёт, `after(fn)` откладывает fn (переход на следующую стадию) до его конца; смена стадии (reset) снимает ожидание.
export const COUNT_WAIT_CAP_MS = 6000 // самое долгое ожидание конца реплики Пита перед нотами (LINE_WAIT_MS 3 с + сама реплика)
export const COUNT_POLL_MS = 60

export function createCountGate() {
  let state = 'idle' // idle | planned | running
  let waiter = null
  const gate = {
    plan() { state = 'planned' },
    run() { state = 'running' },
    done() { state = 'idle'; const w = waiter; waiter = null; w?.() },
    pending: () => state !== 'idle',
    /** Стадия просит перейти дальше: отсчёт ещё не кончился — переход ждёт его конца; иначе сразу */
    after(fn) { if (state === 'idle') fn(); else waiter = fn },
    /** Смена стадии / пауза / выход: ожидание снято, отсчёт не считается идущим */
    reset() { state = 'idle'; waiter = null },
  }
  return gate
}

/**
 * Запланировать отсчёт стадии на countAt мс; когда придёт время — ждать, пока Пит не договорит (busyLeft() ≤ 0, опрос COUNT_POLL_MS, не дольше cap), и стартовать ноты. gate отмечается сразу (стадия не уйдёт, пока отсчёт не кончится).
 * → cancel(): таймеры сняты, ноты остановлены. start/setTimer подставляются в тестах
 */
export function scheduleStageCount({ countAt, busyLeft = () => 0, gate, cap = COUNT_WAIT_CAP_MS, poll = COUNT_POLL_MS, start = startCountdown, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = 0
  let stop = null
  let cancelled = false
  gate?.plan()
  const begin = () => { gate?.run(); stop = start({ onDone: () => gate?.done() }) }
  const wait = waited => {
    if (cancelled) return
    if (busyLeft() <= 0 || waited >= cap) { begin(); return }
    timer = setTimer(() => wait(waited + poll), poll)
  }
  timer = setTimer(() => wait(0), countAt)
  return () => { cancelled = true; clearTimer(timer); stop?.(); gate?.reset() }
}
