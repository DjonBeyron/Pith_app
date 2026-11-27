// Общий цикл кадров игры: ОДИН requestAnimationFrame на кадр вместо 4–7 независимых циклов (пилюли, конвейер, рот Пита, усы, Мия, шкала экзамена) — журнал владельца 2026-11-25: медиана 292 вызова
// requestAnimationFrame в секунду, до 460. Порядок внутри кадра задан, а не случаен (у независимых циклов он зависел от того, кто раньше проснулся):
//   frameTick — логика кадра и её записи (движок пилюль, шаг Мии и шкалы; между собой — по порядку постановки, как у requestAnimationFrame);
//   frameDraw — чистые «писатели», которые ничего не читают (конвейер дорожек, рот и усы котов), — после логики.
// Честно о выигрыше (замер на сборке, CPU 4×): время кадра сам порядок НЕ сокращает — пересчёт стилей стоит по числу затронутых элементов, а не по числу чтений размеров; пробная очередь «сначала все
// чтения» выигрыша не дала и убрана. Выигрыш — один вызов requestAnimationFrame на кадр и предсказуемый порядок; время экономят правки, уменьшающие число пересчитываемых элементов (laneConveyorMover.js, race-mia.css).
// Вызов одноразовый, как requestAnimationFrame: цикл ставит себя заново из своего кадра (попадает в следующий кадр). → id для frameCancel. Колбэк получает метку времени кадра.
// Ошибка одного колбэка остальным не мешает (как у requestAnimationFrame) и уходит в общий перехват ошибок. Пока очереди пусты, requestAnimationFrame не запрашивается — цикл спит.
const fresh = () => [new Map(), new Map()]
let queues = fresh(), running = null, seq = 0, native = 0

const report = e => { try { if (typeof globalThis.reportError === 'function') globalThis.reportError(e); else setTimeout(() => { throw e }, 0) } catch { /* перехват ошибок недоступен */ } }

function flush(ts) {
  native = 0
  running = queues; queues = fresh()
  for (const q of running) for (const fn of q.values()) { try { fn(ts) } catch (e) { report(e) } }
  running = null
}

function add(phase, fn) {
  const id = ++seq
  queues[phase].set(id, fn)
  if (!native) native = (globalThis.requestAnimationFrame ?? (f => setTimeout(() => f(globalThis.performance.now()), 16)))(flush)
  return id
}

/** Логика кадра (может и читать, и писать) */
export const frameTick = fn => add(0, fn)
/** Запись в DOM без чтений — в конце кадра */
export const frameDraw = fn => add(1, fn)
/** Снять поставленный колбэк (в том числе из другого колбэка этого же кадра) */
export function frameCancel(id) {
  for (const q of queues) if (q.delete(id)) return
  if (running) for (const q of running) if (q.delete(id)) return
}
/** Выполнить fn через n кадров (n ≥ 1; по умолчанию в СЛЕДУЮЩЕМ кадре, а не в этом): так тяжёлая реакция (верный ответ: вспышка дорожки, нота, лицо Пита) не складывается в один кадр с улётом пилюли — каждая запись в своём кадре
 * (журнал Android 2026-11-27: микро-фризы на улёте — кадр ответа 35–50 мс при бюджете 16,7). Отменить нельзя; fn не бросает наружу (ошибка идёт в перехват, как у остальных колбэков кадра). Нет цикла кадров (тест без rAF) — через setTimeout 16 мс */
export function frameAfter(fn, n = 1) {
  const step = left => frameTick(() => { if (left > 1) step(left - 1); else fn() })
  step(Math.max(1, n | 0))
}
/** Для тестов и датчика: сколько колбэков ждёт кадра по очередям [tick, draw] */
export const frameQueued = () => queues.map(q => q.size)
