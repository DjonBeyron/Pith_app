import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import {
  PROMPT_CONTROL_KEY, clampShare, applyShare, adoptProfileGroup, getGroupForSignup,
} from '../lib/prompts/promptGroup.js'

// Контрольная группа без вопросов Пита на сервере (миграция 20261027140000_prompt_group.sql):
//   RPC set_prompt_group(p_group)  — записать группу в профиль, если её там ещё нет; вернуть группу профиля
//   app_settings.prompt_control    — { share: 0..50 }, доля контрольной группы, % (0 = группы нет);
//                                    ключ в белом списке app_settings_public_keys — читает и гость, пишет админ
// Логика группы и кэш в localStorage — shared/lib/prompts/promptGroup.js. Сетевые ошибки не бросаются: тихо, группа остаётся прежней.

// Вошедший: отдать серверу группу устройства (если в профиле уже есть — вернётся она) и принять ответ.
// Возвращает группу профиля или null (профиля нет / ошибка сети)
export async function syncPromptGroup() {
  try {
    dbg('[DB RPC] set_prompt_group')
    const { data, error } = await supabase.rpc('set_prompt_group', { p_group: getGroupForSignup() })
    if (error) { dbg('[DB ERROR] set_prompt_group', error.message); return null }
    if (typeof data !== 'string') return null
    adoptProfileGroup(data)
    return data
  } catch (e) {
    dbg('[DB ERROR] set_prompt_group', e?.message)
    return null
  }
}

// Прочитать долю (гость тоже) и положить в кэш. Возвращает долю или null, если прочитать не удалось.
// Строки нет → DEFAULT (applyShare сам зажмёт нечисло к DEFAULT_SHARE)
export async function loadPromptShare() {
  try {
    dbg('[DB READ] app_settings', PROMPT_CONTROL_KEY)
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', PROMPT_CONTROL_KEY).maybeSingle()
    if (error) { dbg('[DB ERROR] prompt_control read', error.message); return null }
    const share = clampShare(data?.value?.share)
    applyShare(share)
    return share
  } catch (e) {
    dbg('[DB ERROR] prompt_control read', e?.message)
    return null
  }
}

// Только админ (RLS app_settings_write_admin). upsert с .select(): UPDATE, отсечённый RLS, иначе выглядел бы как успех.
// Возвращает сохранённую (зажатую в 0..50) долю; ошибка — исключение
export async function savePromptShare(share) {
  const value = { share: clampShare(share) }
  dbg('[DB WRITE] app_settings', PROMPT_CONTROL_KEY)
  const { data, error } = await supabase.from('app_settings')
    .upsert({ key: PROMPT_CONTROL_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) { dbg('[DB ERROR] prompt_control save', error.message); throw error }
  if (!data?.length) throw new Error('Сохранение не применилось: сервер не подтвердил запись')
  applyShare(value.share)
  return value.share
}
