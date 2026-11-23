import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import { PAUSES_SETTING_KEY, PAUSES_V, validatePauses, setPauseOverrides } from '../lib/scenePauses.js'

// Паузы сценария игры «Встряхни память» на сервере (CONCEPT_TIMELINE.md, «Шаг 2»): строка app_settings, ключ race_scene_pauses —
// { v: 1, pauses: { ключ реестра: мс }, savedAt, by }. Реестр и пределы — shared/lib/scenePauses.js. Образец — catLinesApi.js.
// Читают ВСЕ игроки (ключ должен быть в белом списке app_settings_public_keys — миграция 20261123090000_scene_pauses_public_key.sql; без неё строку видит только админ,
// остальные получают «нет строки» и играют на значениях по умолчанию). Пишет только админ (RLS app_settings_write_admin).
// Игра: loadScenePauses() — один запрос на сеанс страницы, не бросает, старт игры его не ждёт; ответ кладётся в слой server реестра и действует со следующей сборки стадий.
// Экран настроек: readScenePauses({ fresh: true }) и saveScenePauses(pauses, { by }) → { ok, error }.

let cache // undefined — не читали; null — строки нет (или ошибка чтения); иначе — значение строки
let inflight = null

const apply = value => setPauseOverrides(value?.pauses ?? null, { source: 'server', commit: false })

/** Строка настройки: { ok, value (как лежит на сервере или null), error }. fresh — мимо кэша сеанса */
export async function readScenePauses({ fresh = false } = {}) {
  if (cache !== undefined && !fresh) return { ok: true, value: cache, error: null }
  if (inflight) return inflight
  dbg('[DB READ] app_settings', PAUSES_SETTING_KEY)
  inflight = Promise.resolve()
    .then(() => supabase.from('app_settings').select('value').eq('key', PAUSES_SETTING_KEY).maybeSingle())
    .then(({ data, error }) => {
      if (error) { dbg('[DB ERROR] race_scene_pauses read', error.message); return { ok: false, value: null, error: error.message } }
      cache = data?.value ?? null
      return { ok: true, value: cache, error: null }
    })
    .catch(e => { dbg('[DB ERROR] race_scene_pauses read', e?.message); return { ok: false, value: null, error: e?.message || 'ошибка чтения' } })
    .finally(() => { inflight = null })
  return inflight
}

/** Игровой путь: прочитать (раз за сеанс) и положить в реестр пауз. Никогда не бросает. → { pauses, dropped } | null (строки нет или ошибка — игра на умолчаниях) */
export async function loadScenePauses(opts) {
  try {
    const r = await readScenePauses(opts)
    if (!r.ok) return null
    const res = apply(r.value)
    if (res.dropped.length) dbg(`[pauses] с сервера отброшено ${res.dropped.length}: ${res.dropped.map(d => `${d.key}=${d.value} (${d.why})`).join(', ')}`)
    return r.value ? res : null
  } catch (e) { dbg('[pauses] чтение не удалось', e?.message); return null }
}

/**
 * Записать паузы для всех игроков (только админ). pauses — { ключ: мс } (пустой набор — «всё по умолчанию»); негодные значения не пишутся: → { ok: false, error, dropped }.
 * .select() обязателен: UPDATE, отсечённый политикой, без него выглядел бы успехом. → { ok, error, value, dropped }
 */
export async function saveScenePauses(pauses, { by = null } = {}) {
  const { pauses: good, dropped } = validatePauses(pauses)
  if (dropped.length) return { ok: false, error: `не сохранено: ${dropped.map(d => `${d.key || '—'} (${d.why})`).join(', ')}`, value: null, dropped }
  const value = { v: PAUSES_V, pauses: good, savedAt: new Date().toISOString(), by }
  try {
    dbg('[DB WRITE] app_settings', PAUSES_SETTING_KEY)
    const { data, error } = await supabase.from('app_settings').upsert({ key: PAUSES_SETTING_KEY, value, updated_at: value.savedAt }, { onConflict: 'key' }).select('key')
    if (error) { dbg('[DB ERROR] race_scene_pauses save', error.message); return { ok: false, error: error.message, value: null, dropped } }
    if (!data?.length) return { ok: false, error: 'Сохранение не применилось: сервер не подтвердил запись (нужны права админа)', value: null, dropped }
    cache = value; apply(value)
    return { ok: true, error: null, value, dropped }
  } catch (e) { return { ok: false, error: e?.message || 'ошибка записи', value: null, dropped } }
}

/** Сбросить кэш сеанса (тесты) */
export const _resetScenePausesCache = () => { cache = undefined; inflight = null }
