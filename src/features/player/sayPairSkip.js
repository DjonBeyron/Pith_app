// Выходы модуля «Сказать фразу» и сообщение-успех после него. Цепочка автора: [текстовая нода-задание] → [say_phrase] → [текстовая нода-успех].
// У ноды ДВА выхода (sayTriggers.js): say_done — «верный», say_wrong — «неверный» (старое имя say_skip читается как «неверный»). Панель отдаёт плееру
// один из трёх итогов (onDone → useGraphPlayer.onNodeDone), а sayExit решает, куда идти:
//  - say_done  — проверка пройдена → выход «верный», ничего не пропускается;
//  - say_wrong — три неудачные попытки → выход «неверный», ничего не пропускается;
//  - say_cant  — «Я не могу говорить» (на любой попытке) → ВСЕГДА выход «верный», но сообщение-успех сразу после модуля пропускается: хвалить не за что.
// Пропуск разовый и без состояния: он целиком определяется итогом ЭТОГО закрытия модуля (флага в sessionStorage нет), поэтому не «залипает» на другие модули
// и уроки, не переживает шаг назад админа и применяется ровно один раз (дедуп firedRef в useGraphPlayer).
// Безопасно по графу: если соединён только один выход — идём по нему (старые уроки с одним выходом работают как «верный» при любом исходе); нет ни одного — null
// (дальше обычный конец цепочки/урока). Пропускаем только то, что не потеряет нужный контент: сообщение-успех — обычная текстовая нода (type text) с единственным
// входом (от модуля) и единственным выходом дальше; иначе (аудио/фото, развилка, общий узел, конец урока) оно показывается как обычно.
// Если ученик не справился, но ветки «неверный» нет (три неудачи в старом уроке) — по «верному» выходу сообщение-успех тоже пропускается. Чистые функции от карты нод {id → нода}; без React.
import { SAY_DONE, SAY_WRONG, SAY_CANT, wrongTrigger } from '../../shared/lib/speech/sayTriggers.js'

const SAY = 'say_phrase'
const SAY_RESULTS = new Set([SAY_DONE, SAY_WRONG, SAY_CANT])
const outs = n => (n?.triggers ?? []).filter(t => t.then).map(t => t.then)
const trig = (n, kind) => (n?.triggers ?? []).find(t => t.if === kind && t.then) ?? null

/** Сколько триггеров во всём графе ведёт на ноду */
export function incomingCount(map, id) {
  let c = 0
  for (const n of Object.values(map)) for (const t of n.triggers ?? []) if (t.then === id) c += 1
  return c
}

/** Сообщение-успех модуля (по выходу «верный»): { id, next } или null (нода не подходит под условия безопасности — не трогаем) */
export function successOf(map, say) {
  const done = trig(say, SAY_DONE)
  const d = done ? map[done.then] : null
  if (!d || d.type !== 'text' || incomingCount(map, d.id) !== 1) return null
  const next = outs(d)
  return next.length === 1 && map[next[0]] ? { id: d.id, next: next[0] } : null
}

/**
 * Модуль закрыт итогом result (say_done | say_wrong | say_cant) — куда идти. null — это не наш случай (не say_phrase, другой итог) или у модуля нет ни одного
 * подключённого выхода: плеер продолжает обычным путём. { then, skipped } — показать узел then; skipped — id пропущенного сообщения-успеха (или null).
 */
export function sayExit(map, node, result) {
  if (node?.type !== SAY || !SAY_RESULTS.has(result)) return null
  const done = trig(node, SAY_DONE)
  const wrong = wrongTrigger(node.triggers)
  const t = (result === SAY_WRONG ? wrong : done) ?? done ?? wrong // нужного выхода нет — идём по существующему
  if (!t) return null
  const skip = result !== SAY_DONE && t === done ? successOf(map, node) : null
  return { then: skip?.next ?? t.then, skipped: skip?.id ?? null }
}
