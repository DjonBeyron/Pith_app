import { supabase } from './supabase.js'
import { viewSession } from './viewSession.js'
import { dbg } from '../lib/debug.js'
import { notifyMemoryChanged } from '../lib/memoryChangedEvent.js'
import { localDate } from '../lib/memory/dailyPick.js'
import { wordKey } from '../lib/wordAudio/wordKey.js'
import { catchGuestHeard, catchGuestHelp, guestCatchCounts } from '../lib/memory/guestCatch.js'

// «Ловля слов в ленте»: сигналы в память от слайда с заданием «напечатай
// расслышанные слова» (миграция 20261008120000_feed_catch.sql). Шаг слова
// не меняется ни одним из них — только журнал review_events (source
// 'feed_catch') и, при «Помочь памяти», срок на завтра. Слово передаём как
// есть — нормализует сервер (word_key); гостю нормализуем сами (wordKey) и
// пишем в локальную память (guestCatch.js). Без миграции — null / пустая
// Map, лента не падает.

const isGuest = async () => !(await viewSession())?.user
const today = () => localDate(new Date())
const MIGRATION_HINT = 'применить миграцию 20261008120000_feed_catch.sql'

// Напечатал слово сам — «услышано в живой речи».
// → { ok, word, heard } | { ok: false, reason } | null
export async function catchHeard(word, moduleId) {
  if (await isGuest()) return catchGuestHeard(wordKey(word), moduleId, today())
  const { data, error } = await supabase.rpc('memory_catch_heard', { p_word: word, p_module_id: moduleId ?? null })
  if (error) { console.error('[CATCH] memory_catch_heard:', error.message, '—', MIGRATION_HINT); return null }
  dbg('[CATCH] memory_catch_heard →', data)
  return data ?? null
}

// «Помочь памяти» — не расслышал: слово завтра первой карточкой.
// → { ok, word, due_on } | { ok: false, reason } | null
export async function catchHelp(word, moduleId) {
  let data
  if (await isGuest()) {
    data = catchGuestHelp(wordKey(word), moduleId, today())
  } else {
    const res = await supabase.rpc('memory_catch_help', { p_word: word, p_module_id: moduleId ?? null })
    if (res.error) { console.error('[CATCH] memory_catch_help:', res.error.message, '—', MIGRATION_HINT); return null }
    data = res.data ?? null
    dbg('[CATCH] memory_catch_help →', data)
  }
  if (data?.ok) notifyMemoryChanged() // срок изменился — вкладка «Память» перечитает
  return data
}

// Счётчики «услышано в N видео» → Map<word, heard>. Гостю — из локального
// журнала (последние 30 дней); сбой / нет миграции — пустая Map
export async function listCatchCounts() {
  if (await isGuest()) return guestCatchCounts()
  const { data, error } = await supabase.rpc('memory_catch_counts')
  if (error) { dbg('[CATCH] memory_catch_counts:', error.message, '—', MIGRATION_HINT); return new Map() }
  return new Map((data ?? []).map(r => [r.word, r.heard ?? 0]))
}
