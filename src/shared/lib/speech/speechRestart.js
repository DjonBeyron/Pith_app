// Стратегии перезапуска распознавания и «затвор» между попытками (iOS: аудиосессия прошлого экземпляра освобождается не сразу, второй запуск
// подряд бывает «глухим», см. speechDeaf.js). Контроллер (speechController.js) не создаёт и не запускает следующую попытку, пока прошлый экземпляр
// не закрыт событием end (или не прошёл STOP_FORCE_MS) и не прошла пауза выбранной стратегии. Чистая логика, таймеры — глобальные (в тестах fake timers).
import { RESTART_COOLDOWN_MS, STOP_FORCE_MS } from './speechPolicy.js'

// reuse — один экземпляр на все попытки (start() на том же объекте после end); stop — гасить stop() вместо abort(); waitEnd — ждать end прошлого
// экземпляра; pauseMs — пауза после end; audioSession — тип navigator.audioSession на время записи, audioReset — перед стартом 'auto' → 150 мс → тип
// (speechAudioSession.js; без API S6/S7 деградируют до S3). S1 = поведение до правки аудиосессии
export const STRATEGIES = {
  S1: { reuse: false, stop: false, waitEnd: false, pauseMs: 0 },
  S2: { reuse: true, stop: false, waitEnd: true, pauseMs: 0 },
  S3: { reuse: false, stop: false, waitEnd: true, pauseMs: 900 },
  S4: { reuse: false, stop: true, waitEnd: true, pauseMs: 700 },
  S5: { reuse: true, stop: false, waitEnd: true, pauseMs: 700 },
  S6: { reuse: false, stop: false, waitEnd: true, pauseMs: 700, audioSession: 'play-and-record' },
  S7: { reuse: false, stop: false, waitEnd: true, pauseMs: 700, audioSession: 'play-and-record', audioReset: true },
}
export const STRATEGY_IDS = Object.keys(STRATEGIES)
/** Модуль «Сказать фразу»: новый экземпляр на попытку, но только после end прошлого + RESTART_COOLDOWN_MS (прозрачно для ученика) */
export const MODULE_STRATEGY = { reuse: false, stop: false, waitEnd: true, pauseMs: RESTART_COOLDOWN_MS }

/** id ('S1'…'S7', 'M') или объект настроек → { id, reuse, stop, waitEnd, pauseMs }; незнакомое → S1 */
export function resolveStrategy(x) {
  if (x && typeof x === 'object') return { id: x.id ?? 'custom', ...STRATEGIES.S1, ...x }
  if (x === 'M') return { id: 'M', ...MODULE_STRATEGY }
  const id = STRATEGIES[x] ? x : 'S1'
  return { id, ...STRATEGIES[id] }
}

/**
 * Затвор между попытками. close(rec, seen) — контроллер закрыл экземпляр (seen — end уже приходил); whenReady(fn, st) запускает fn сразу (СИНХРОННО — важно для
 * жеста iOS), если ждать нечего, иначе ставит его в очередь (одно ожидающее действие) до end прошлого экземпляра (если st.waitEnd) + st.pauseMs: пауза считается
 * по стратегии ЗАПУСКАЕМОЙ попытки, поэтому смена стратегии между нажатиями ничего не ломает. onChange(cooling) — флаг для кнопки «Подготовка микрофона…»
 * (по текущей стратегии getStrategy()); end, которого нет дольше STOP_FORCE_MS, считаем пришедшим (lastEndOk() = false: такой экземпляр не переиспользуем).
 */
export function createRestartGate({ onChange = () => {}, getStrategy = () => STRATEGIES.S1 } = {}) {
  let last = null    // последнее закрытие: { token, ended, endAt, ok, closeAt, force }
  let waiter = null  // ожидающий запуск: { fn, st, timer }
  let ui = false     // что отдали в onChange
  let uiTimer = 0
  let seq = 0

  // Сколько ждать запуску со стратегией st: 0 — можно сейчас; Infinity — end ещё не пришёл
  function delayFor(st) {
    if (!last || (!st.waitEnd && st.pauseMs <= 0)) return 0
    if (st.waitEnd && !last.ended) return Infinity
    return Math.max(0, (st.waitEnd ? last.endAt : last.closeAt) + st.pauseMs - Date.now())
  }
  // Пересчёт после любого изменения: флаг для кнопки, затем ожидающий запуск (в таком порядке: cooling=false раньше, чем стартовые view запуска)
  function settle(fromEvent = false) {
    clearTimeout(uiTimer)
    const d = delayFor(getStrategy())
    if ((d > 0) !== ui) { ui = d > 0; onChange(ui) }
    if (ui && d !== Infinity) uiTimer = setTimeout(() => settle(true), d)
    if (!waiter) return
    clearTimeout(waiter.timer)
    const wd = delayFor(waiter.st)
    if (wd === Infinity) return
    const w = waiter
    const run = () => { if (waiter === w) { waiter = null; w.fn() } }
    if (wd === 0 && !fromEvent) run() // не внутри обработчика end: следующий запуск на следующем такте
    else w.timer = setTimeout(run, wd)
  }
  function ended(token, ok) {
    if (!last || last.token !== token || last.ended) return
    clearTimeout(last.force)
    Object.assign(last, { ended: true, ok, endAt: Date.now() })
    settle(true)
  }
  return {
    close(rec, seen) {
      if (last) clearTimeout(last.force)
      const token = ++seq
      last = { token, ended: false, ok: false, endAt: null, closeAt: Date.now(), force: 0 }
      if (seen) { Object.assign(last, { ended: true, ok: true, endAt: last.closeAt }); settle(); return }
      rec.onend = () => ended(token, true) // обработчики попытки сняты, нужен только end
      last.force = setTimeout(() => ended(token, false), STOP_FORCE_MS)
      settle()
    },
    whenReady(fn, st) {
      if (delayFor(st) === 0) { fn(); return true }
      waiter = { fn, st, timer: 0 }
      settle()
      return false
    },
    /** Отменить ожидающий запуск; true — он был */
    cancelWait() { const had = waiter !== null; if (waiter) clearTimeout(waiter.timer); waiter = null; return had },
    cooling: () => ui,
    lastEndOk: () => !last || last.ok,
  }
}
