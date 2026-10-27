import { supabase } from './supabase.js'
import { viewSession } from './viewSession.js'
import { dbg } from '../lib/debug.js'
import { notifyMemoryChanged } from '../lib/memoryChangedEvent.js'
import { localDate } from '../lib/memory/dailyPick.js'
import { seedGuestWord } from '../lib/memory/guestMemory.js'
import { wordKey } from '../lib/wordAudio/wordKey.js'
import { listLessonDeckFlags } from '../lib/lessonsApi.js'
import { hasMemoryWord } from './memoryApi.js'

// «Семена памяти» (B6): слово из ленты — в память по кнопке «Сохранить». Сервер: RPC memory_seed_word
// (миграция 20261027160000_memory_seed_word.sql): шаг 1, повторить завтра, как при прохождении урока-слова.
// Гостю — локально (guestMemory.seedGuestWord). После успеха — notifyMemoryChanged (точка/мозг на панели).

const isGuest = async () => !(await viewSession())?.user

// → { ok, word, created } | { ok: false, reason } | null (сбой сети / нет миграции)
export async function seedMemoryWord(word, moduleId = null) {
  let data
  if (await isGuest()) {
    const key = wordKey(word)
    if (!key) return { ok: false, reason: 'word' }
    seedGuestWord(key, localDate(new Date()))
    data = { ok: true, word: key, created: true }
  } else {
    const res = await supabase.rpc('memory_seed_word', { p_word: word, p_module_id: moduleId ?? null })
    if (res.error) { console.error('[MEMORY] memory_seed_word:', res.error.message); return null }
    dbg('[MEMORY] memory_seed_word →', res.data)
    data = res.data ?? null
  }
  if (data?.ok) notifyMemoryChanged()
  return data
}

// Слова с колодой повторения: набор ключей (урок с reviewCards). Список уроков тяжёлый (все уроки) —
// держим в памяти вкладки несколько минут
const DECK_TTL_MS = 5 * 60 * 1000
let deckCache = null // { at, words: Set }

export function resetDeckCache() { deckCache = null }

async function deckWords() {
  if (deckCache && Date.now() - deckCache.at < DECK_TTL_MS) return deckCache.words
  const rows = await listLessonDeckFlags()
  const words = new Set(rows.filter(r => r.deck).map(r => wordKey(r.title)).filter(Boolean))
  deckCache = { at: Date.now(), words }
  return words
}

// Можно ли предложить сохранить слово: у него есть колода повторения и его ещё нет в памяти.
// Сбой запроса — false (предложение просто не появится)
export async function canSeedWord(word) {
  const key = wordKey(word)
  if (!key) return false
  try {
    if (!(await deckWords()).has(key)) return false
    return (await hasMemoryWord(key)) === false
  } catch (e) {
    dbg('[MEMORY] canSeedWord:', e?.message)
    return false
  }
}
