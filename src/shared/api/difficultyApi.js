import { supabase } from './supabase.js'

// Сложность фразы на слух: голос 1 (легко) / 2 (средне) / 3 (сложно).
// Одна строка на (user, module), голос перезаписываемый. Итог (медиана +
// число голосов) лежит денормализованно на curricula — пересчитывает
// триггер в БД при каждом голосе (recalc_module_difficulty).

// Пока голосов меньше порога — иконка серая («мало оценок»),
// один голос фразу не красит
export const MIN_DIFFICULTY_VOTES = 5

// Мои голоса по всем модулям: { moduleId: 1|2|3 }. Гость → пусто.
export async function fetchMyDifficultyVotes() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return {}
  const { data, error } = await supabase
    .from('module_difficulty_votes')
    .select('module_id, vote')
    .eq('user_id', session.user.id)
  if (error) {
    console.error('[DIFF] votes select:', error.message)
    return {}
  }
  return Object.fromEntries((data ?? []).map(r => [r.module_id, r.vote]))
}

// Поставить/переписать голос
export async function setDifficultyVote(moduleId, vote) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return false
  const { error } = await supabase.from('module_difficulty_votes').upsert(
    { user_id: session.user.id, module_id: moduleId, vote },
    { onConflict: 'user_id,module_id' },
  )
  if (error) {
    console.error('[DIFF] vote upsert:', error.message)
    return false
  }
  return true
}

// Уровень для иконки. Рекомендации — общий итог (null до порога голосов);
// «Мои уроки» (preferMine) — приоритетно свой голос.
export function displayDifficulty(mod, myVote, preferMine = false) {
  if (preferMine && myVote) return myVote
  return (mod.difficultyVotes ?? 0) >= MIN_DIFFICULTY_VOTES ? mod.difficulty : null
}
