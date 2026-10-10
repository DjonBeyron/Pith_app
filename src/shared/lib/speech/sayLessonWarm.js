// Ранний прогрев Vosk при ВХОДЕ В УРОК, в котором есть нода say_phrase (решение владельца: к моменту модуля модель уже в памяти; раньше греть начинали только при открытии панели,
// и первые попытки шли на системном). Вызывается из useLessonWarmups.js, пока урок открыт; отмена (урок закрыт) освобождает прогрев — модель живёт ещё FREE_AFTER_MS (voskRuntime.js).
//  1) Модели нет в кэше → фоновая загрузка стартует СРАЗУ (без стартовых 5–8 с приложения), но по тем же правилам «тишины»: не офлайн, не экономия трафика, не лента / видео / файлы урока (voskBgPolicy.canStart).
//  2) Прогрев (библиотека + модель в память) — после первого простоя (idlePrewarm.js: пропускает слабую сеть, ждёт возврата на экран) и когда сеть не занята файлами урока (netBusy, не дольше QUIET_MAX_MS).
// Не греем: в режиме админа «Только системное», в запасном режиме панели (Firefox, «не могу говорить», отказ микрофона). Вне уроков с этим модулем и в ленте не вызывается вовсе.
import { voskRuntime } from '../vosk/voskRuntime.js'
import { startBackground } from '../vosk/voskBackground.js'
import { startIdlePrewarm } from '../idlePrewarm.js'
import * as netBusy from '../netBusy.js'
import { readSayEngine } from './sayEngineMode.js'
import { sayPermission } from './sayPermission.js'

export const QUIET_MAX_MS = 20000 // дольше сеть «занятой» не ждём: к модулю библиотека должна быть готова

/** Дождаться, пока сеть свободна (netBusy), но не дольше maxMs. Возвращает cancel() */
function whenQuiet({ busy, run, maxMs, setTimer, clearTimer }) {
  if (!busy.isBusy()) { run(); return () => {} }
  let off = () => {}
  const timer = setTimer(() => { off(); run() }, maxMs)
  off = busy.subscribe(() => { if (!busy.isBusy()) { clearTimer(timer); off(); run() } })
  return () => { clearTimer(timer); off() }
}

/**
 * Запустить ранний прогрев. Возвращает cancel(): снимает ожидание и освобождает прогрев (если успел взяться). deps подставляются в тестах.
 */
export function startLessonWarm(deps = {}) {
  const d = {
    runtime: voskRuntime, background: () => startBackground(), idle: startIdlePrewarm, busy: netBusy, getMode: readSayEngine,
    canWarm: () => sayPermission.decide().action !== 'fallback', setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), ...deps,
  }
  if (d.getMode() === 'system') return () => {}
  let release = null
  let cancelled = false
  let stopWait = () => {}
  d.background() // модели нет в кэше → качаем сразу (в кэше — проверка без чтения тела); «тишину» соблюдает сама загрузка
  const acquire = () => { if (!cancelled && !release && d.canWarm()) try { release = d.runtime.acquire('lesson') } catch { /* прогрев никогда не роняет урок */ } }
  const stopIdle = d.idle([() => { if (!cancelled) stopWait = whenQuiet({ busy: d.busy, run: acquire, maxMs: QUIET_MAX_MS, setTimer: d.setTimer, clearTimer: d.clearTimer }) }])
  return () => { cancelled = true; stopIdle(); stopWait(); release?.(); release = null }
}
