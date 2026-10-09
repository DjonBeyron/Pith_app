// «Не могу говорить» и пара сообщений вокруг «Сказать фразу». Цепочка автора: [текстовая нода-задание] → [say_phrase] →
// [текстовая нода-успех]. Когда ученик нажал «Я не могу говорить», в сессии включается флаг (cantSpeakFlag.js) и дальше:
//  - сообщение-успех сразу ПОСЛЕ модуля не показывается (модуль пропущен, хвалить не за что);
//  - следующие модули этого типа плеер пропускает САМ, не показывая панель, и, когда можно, ВСЮ ТРОЙКУ (задание → модуль → успех).
// Определение пары выводится из графа и осторожное: пропускаем только то, что не потеряет нужный контент —
//  - задание: обычная текстовая нода (type text) с единственным выходом в say_phrase и не более чем одним входом
//    (иначе на неё ссылаются другие ветки);
//  - успех: обычная текстовая нода с единственным входом (от модуля) и единственным выходом дальше;
//  - если у модуля соединён say_skip — приоритет у него: после него сообщения-успеха нет, пропускается только задание;
//  - не выполнено условие — пропускаем лишь сам модуль (его триггер: say_skip, если соединён, иначе say_done).
// Чистые функции от карты нод {id → нода} и флага; без React. Зовёт useGraphPlayer.js (показ ноды и конец модуля).
import { isCantSpeakSession } from '../../shared/lib/speech/cantSpeakFlag.js'
import { track } from '../../shared/lib/analytics/track.js'

const SAY = 'say_phrase'
const outs = n => (n?.triggers ?? []).filter(t => t.then).map(t => t.then)
const trig = (n, kind) => (n?.triggers ?? []).find(t => t.if === kind && t.then) ?? null

/** Сколько триггеров во всём графе ведёт на ноду */
export function incomingCount(map, id) {
  let c = 0
  for (const n of Object.values(map)) for (const t of n.triggers ?? []) if (t.then === id) c += 1
  return c
}

/** Сообщение-успех модуля: { id, next } или null (say_skip соединён — успеха нет; нода не подходит — не трогаем) */
export function successOf(map, say) {
  const done = trig(say, 'say_done')
  if (!done || trig(say, 'say_skip')) return null
  const d = map[done.then]
  if (!d || d.type !== 'text' || incomingCount(map, d.id) !== 1) return null
  const next = outs(d)
  return next.length === 1 && map[next[0]] ? { id: d.id, next: next[0] } : null
}

/** Куда идти после пропущенного модуля: say_skip (если соединён) → иначе мимо сообщения-успеха → иначе say_done. null — идти некуда */
export function afterSkip(map, say) {
  const skip = trig(say, 'say_skip')
  if (skip) return skip.then
  return successOf(map, say)?.next ?? trig(say, 'say_done')?.then ?? null
}

/** Задание перед модулем: плеер собирается показать эту текстовую ноду — вернуть say_phrase, если нода и есть задание, иначе null */
function moduleOfTask(map, task) {
  if (task?.type !== 'text') return null
  const next = outs(task)
  const say = next.length === 1 ? map[next[0]] : null
  return say?.type === SAY && incomingCount(map, task.id) <= 1 ? say : null
}

/**
 * Плеер собирается показать ноду nodeId. Ответ при включённом флаге «Не могу говорить»:
 *  { goto } — пропустить тройку (задание → модуль → успех) и показать вместо неё узел goto;
 *  { done: {nodeId, result} } — пропустить только модуль: закрыть его триггером result (say_skip / say_done);
 *  null — показываем как обычно (флага нет, нода не из пары)
 */
export function sayRevealJump(map, nodeId, cantSpeak = isCantSpeakSession()) {
  if (!cantSpeak) return null
  const node = map[nodeId]
  if (!node) return null
  if (node.type === SAY) return { done: { nodeId, result: trig(node, 'say_skip') ? 'say_skip' : 'say_done' } }
  const say = moduleOfTask(map, node)
  if (!say) return null
  // тройка — когда у модуля есть куда идти без успеха (say_skip) или успех пропускаем; иначе задание остаётся, пропустится один модуль
  const goto = trig(say, 'say_skip')?.then ?? successOf(map, say)?.next ?? null
  return goto ? { goto } : null
}

/** Модуль закрыт триггером say_done при включённом флаге (ученик нажал «Я не могу говорить» без ветки say_skip): куда вместо сообщения-успеха */
export function saySuccessSkip(map, node, result, cantSpeak = isCantSpeakSession()) {
  if (!cantSpeak || node?.type !== SAY || result !== 'say_done') return null
  return successOf(map, node)?.next ?? null
}

/** Выполнить прыжок из sayRevealJump: reveal(id) — показать узел, finish(nodeId, result) — закрыть модуль триггером. Событие аналитики без текста */
export function applySayJump(jump, { reveal, finish }) {
  try { track('say_phrase_skip', { reason: 'cant_speak_auto', kind: jump.goto ? 'pair' : 'module' }) } catch { /* аналитика необязательна */ }
  if (jump.goto) reveal(jump.goto)
  else finish(jump.done.nodeId, jump.done.result)
}
