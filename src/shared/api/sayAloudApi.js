import { supabase } from './supabase.js'
import { viewSession } from './viewSession.js'
import { dbg } from '../lib/debug.js'
import { notifyMemoryChanged } from '../lib/memoryChangedEvent.js'
import { localDate } from '../lib/memory/dailyPick.js'
import { pullGuestWordDue } from '../lib/memory/guestMemory.js'
import { wordKey } from '../lib/wordAudio/wordKey.js'

// Итог раунда «Скажи вслух» → память. Сервер: RPC say_aloud_result (миграция 20261027200000_say_aloud_result.sql):
// промах — слово завтра (due_on = min(due_on, завтра), шаг не меняется), верное слово «к повтору» — +1 XP, потолок 10 в день.
// Гостю — локально (guestMemory.pullGuestWordDue): промах — слово завтра, XP гость не получает.
// items — [{ word, ok }] (лишние поля игры — перевод — наружу не уходят). После успеха — notifyMemoryChanged.
// → { ok, xp, moved } | null (нечего слать / сбой сети / нет миграции — раунд от этого не страдает)
export async function sendSayAloudResult(items) {
  const list = (items ?? []).map(i => ({ word: i?.word, ok: !!i?.ok })).filter(i => i.word)
  if (!list.length) return null
  let data
  if (!(await viewSession())?.user) {
    const today = localDate(new Date())
    const keys = new Set(list.filter(i => !i.ok).map(i => wordKey(i.word)).filter(Boolean))
    const moved = [...keys].filter(k => pullGuestWordDue(k, today)).length
    data = { ok: true, xp: 0, moved }
  } else {
    const res = await supabase.rpc('say_aloud_result', { p_items: list })
    if (res.error) { console.error('[MEMORY] say_aloud_result:', res.error.message); return null }
    dbg('[MEMORY] say_aloud_result →', res.data)
    data = res.data ?? null
  }
  if (data?.ok && data.moved > 0) notifyMemoryChanged()
  return data
}
