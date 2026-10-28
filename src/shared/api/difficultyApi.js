import { supabase } from './supabase.js'
import { viewSession } from './viewSession.js'
import { effectiveDifficulty, MIN_DIFFICULTY_VOTES } from '../lib/level/effectiveDifficulty.js'

// Сложность фразы на слух: голос 1 (легко) / 2 (средне) / 3 (сложно).
// Одна строка на (user, module), голос перезаписываемый. Итог (медиана +
// число голосов) лежит денормализованно на curricula — пересчитывает
// триггер в БД при каждом голосе (recalc_module_difficulty).

// Пока голосов меньше порога — считаем «Легко» по умолчанию (не серая иконка без данных), если админ не задал
// сложность вручную (curricula.difficulty_admin). Порог и правило выбора — lib/level/effectiveDifficulty.js
export { MIN_DIFFICULTY_VOTES }

// Мои голоса по всем модулям: { moduleId: 1|2|3 }. Гость → пусто.
export async function fetchMyDifficultyVotes() {
  const session = await viewSession()
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
  const session = await viewSession()
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

// Уровень для иконки. Рекомендации — общий итог (голоса от порога, иначе сложность админа, иначе 1/«Легко»;
// не null); «Мои уроки» (preferMine) — приоритетно свой голос.
export function displayDifficulty(mod, myVote, preferMine = false) {
  if (preferMine && myVote) return myVote
  return effectiveDifficulty(mod) ?? 1
}
