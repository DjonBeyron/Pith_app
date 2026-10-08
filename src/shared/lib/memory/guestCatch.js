import { localDate } from './dailyPick.js'
import { MEM_KEY, LOG_KEY, LOG_DAYS, read, write, addDays } from './guestMemory.js'

// «Ловля слов в ленте» для ГОСТЯ — зеркало серверных RPC memory_catch_heard /
// memory_catch_help / memory_catch_counts (миграция 20261008120000_feed_catch.sql)
// над локальной памятью и журналом гостя (guestMemory.js). Шаг слова не меняется
// ни от чего — только журнал и, при «Помочь памяти», срок на завтра.
//
// Ограничение: журнал гостя хранит LOG_DAYS (30) дней — счётчик «услышано в N
// видео» у гостя считает только последние 30 дней. На сервере — за всё время.

const isCatchHeard = r => r.source === 'feed_catch' && r.outcome === 'good'

function appendLog(entry, today) {
  const since = addDays(today, -LOG_DAYS)
  const log = read(LOG_KEY, []).filter(r => localDate(r.created_at) >= since)
  log.push({ ...entry, created_at: new Date().toISOString() })
  write(LOG_KEY, log)
  return log
}

// Напечатал слово сам — «услышано в живой речи»: журнал good, applied=false.
// → { ok, word, heard } | { ok: false, reason: 'not_found' }
export function catchGuestHeard(wordKey, moduleId, today) {
  const cur = read(MEM_KEY, {})[wordKey]
  if (!cur) return { ok: false, reason: 'not_found' }
  const log = appendLog({
    word: wordKey, outcome: 'good', source: 'feed_catch',
    step_before: cur.step, step_after: cur.step, applied: false, events: { module: moduleId ?? null },
  }, today)
  const heard = log.filter(r => r.word === wordKey && isCatchHeard(r)).length
  return { ok: true, word: wordKey, heard }
}

// «Помочь памяти» — не расслышал: due_on = min(due_on, завтра), шаг тот же;
// журнал hard, applied=true. → { ok, word, due_on } | { ok: false, reason }
export function catchGuestHelp(wordKey, moduleId, today) {
  const mem = read(MEM_KEY, {})
  const cur = mem[wordKey]
  if (!cur) return { ok: false, reason: 'not_found' }
  const tomorrow = addDays(today, 1)
  const due = cur.due_on < tomorrow ? cur.due_on : tomorrow
  mem[wordKey] = { ...cur, due_on: due }
  write(MEM_KEY, mem)
  appendLog({
    word: wordKey, outcome: 'hard', source: 'feed_catch',
    step_before: cur.step, step_after: cur.step, applied: true, events: { module: moduleId ?? null },
  }, today)
  return { ok: true, word: wordKey, due_on: due }
}

// Счётчики «услышано в N видео» по словам → Map<word, heard> (за последние LOG_DAYS дней)
export function guestCatchCounts() {
  const counts = new Map()
  for (const r of read(LOG_KEY, [])) {
    if (isCatchHeard(r)) counts.set(r.word, (counts.get(r.word) ?? 0) + 1)
  }
  return counts
}
