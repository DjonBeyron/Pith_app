import { supabase } from './supabase.js'
import { viewSession } from './viewSession.js'
import { dbg } from '../lib/debug.js'
import { emptyLevel } from '../lib/level/levelModel.js'
import { loadLevel, saveLevel, normalizeLevel } from '../lib/level/levelStore.js'

// Профиль уровня (A2, миграция 20261027110000_profile_level.sql): уровень и
// неопределённость по осям «ухо»/«словарь». Вошедшему — user_profiles (RPC
// set_level_profile), гостю — localStorage (levelStore.js). Число наблюдений n
// на сервере не хранится. Без применённой миграции — мягко: уровень остаётся
// локальным, приложение не падает.

const isGuest = async () => !(await viewSession())?.user

// Возвращает { ear, vocab, updatedAt } (у нового пользователя — emptyLevel())
export async function loadLevelProfile() {
  if (await isGuest()) return loadLevel()
  const session = await viewSession()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('ear_level, ear_sigma, vocab_level, vocab_sigma')
    .eq('id', session.user.id)
    .single()
  if (error) { dbg('[LEVEL] user_profiles:', error.message); return loadLevel() }
  if (data?.ear_level == null && data?.vocab_level == null) return emptyLevel()
  return normalizeLevel({
    ear: { level: data.ear_level ?? undefined, sigma: data.ear_sigma ?? undefined, n: 1 },
    vocab: { level: data.vocab_level ?? undefined, sigma: data.vocab_sigma ?? undefined, n: 1 },
  })
}

// Сохраняет уровень; true — записано (на сервер или локально гостю)
export async function saveLevelProfile(level) {
  if (await isGuest()) { saveLevel(level); return true }
  const { error } = await supabase.rpc('set_level_profile', {
    p_ear: level.ear.level, p_ear_sigma: level.ear.sigma,
    p_vocab: level.vocab.level, p_vocab_sigma: level.vocab.sigma,
  })
  if (error) { console.error('[LEVEL] set_level_profile:', error.message); saveLevel(level); return false }
  return true
}
