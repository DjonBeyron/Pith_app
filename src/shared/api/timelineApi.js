import { supabase } from './supabase.js'
import { dbg, pLog } from '../lib/debug.js'

// «Таймлайн игры»: последние прохождения на сервере, чтобы сыграть на телефоне, а смотреть на ПК (CONCEPT_TIMELINE.md, «Последние игры на сервере»). Одна строка app_settings, ключ race_timeline_last:
// { v: 1, runs: [ { id, savedAt (ISO), at, device, appVersion, meta, events, dropped, edits? } ] } — последние TIMELINE_KEEP прохождений, новые в конце.
// edits (с v3.3.340, необязательное) — черновик правок монтажа этого прохождения { v: 1, savedAt, edits: […] } (features/timeline/montage): начать на ПК, продолжить на другом устройстве. Старые записи без поля читаются как раньше. Новой таблицы и миграции нет (образец — catLinesApi.js).
// Пишет только админ (RLS app_settings_write_admin; .select() обязателен — отсечённая политикой запись иначе выглядела бы успехом). Читает админ: ключа нет в белом списке app_settings_public_keys.
// Строку НИКТО не читает на старте приложения: только экран таймлайна при открытии и запись перед тем, как дописать своё прохождение («прочитать → добавить → оставить последние 3 → записать»).
// Гонку двух устройств не решаем: прав последний записавший. Ни одна функция не бросает наружу — игра от сервера не зависит: ошибки уходят в журнал (pLog) и в результат { ok: false, error }.
export const TIMELINE_KEY = 'race_timeline_last'
export const TIMELINE_KEEP = 3          // сколько последних прохождений лежит на сервере
export const TIMELINE_MAX_EVENTS = 3000 // потолок событий одного прохождения на сервере: лишние отрезаются С НАЧАЛА (dropped растёт)

const msgOf = e => String(e?.message ?? e ?? 'неизвестная ошибка')

/** Прохождение под потолок размера: не больше max событий (лишние — с начала, dropped растёт). Вход не меняется */
export function trimRun(run, max = TIMELINE_MAX_EVENTS) {
  const events = Array.isArray(run?.events) ? run.events : [], cut = Math.max(0, events.length - max)
  return { ...run, events: cut ? events.slice(cut) : events, dropped: (Number(run?.dropped) || 0) + cut }
}

/** Значение строки → список прохождений (битое / чужой формат — пусто) */
export const runsOf = value => (Array.isArray(value?.runs) ? value.runs.filter(r => r && Array.isArray(r.events)) : [])

/** Значение строки + новое прохождение → новое значение: то же id заменяется (повторное сохранение), остаются последние keep, новые в конце */
export function mergeRuns(value, run, keep = TIMELINE_KEEP) {
  const all = runsOf(value), old = all.find(r => r.id === run.id), rest = all.filter(r => r.id !== run.id)
  const next = trimRun(run.edits == null && old?.edits != null ? { ...run, edits: old.edits } : run) // повторное сохранение прохождения не стирает его черновик правок
  return { v: 1, runs: [...rest, next].slice(-keep) }
}

/** Прочитать сохранённые прохождения. → { runs, error } (error — текст для экрана или null); не бросает */
export async function readTimelines({ client = supabase } = {}) {
  dbg('[DB READ] app_settings', TIMELINE_KEY)
  try {
    const { data, error } = await client.from('app_settings').select('value').eq('key', TIMELINE_KEY).maybeSingle()
    if (error) { dbg('[DB ERROR] race_timeline_last read', error.message); return { runs: [], error: msgOf(error) } }
    return { runs: runsOf(data?.value), error: null }
  } catch (e) { dbg('[DB ERROR] race_timeline_last read', msgOf(e)); return { runs: [], error: msgOf(e) } }
}

/**
 * Дописать прохождение run (уже с id, savedAt, device, appVersion — timelineStore.packRun) к сохранённым: чтение → слияние → запись.
 * → { ok, error, bytes (размер строки JSON), count (прохождений на сервере), events }; не бросает, об отказе пишет в журнал (log).
 */
export async function saveTimeline(run, { client = supabase, log = pLog } = {}) {
  try {
    const cur = await client.from('app_settings').select('value').eq('key', TIMELINE_KEY).maybeSingle()
    if (cur.error) throw cur.error
    const value = mergeRuns(cur.data?.value, run), bytes = JSON.stringify(value).length
    dbg('[DB WRITE] app_settings', TIMELINE_KEY, `${bytes} зн.`)
    const { data, error } = await client.from('app_settings').upsert({ key: TIMELINE_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }).select('key')
    if (error) throw error
    if (!data?.length) throw new Error('сервер не подтвердил запись (нужны права админа)')
    const saved = value.runs[value.runs.length - 1]
    log(`[timeline] прохождение сохранено на сервер: событий ${saved.events.length}${saved.dropped ? ` (отрезано с начала ${saved.dropped})` : ''}, на сервере прохождений ${value.runs.length}, строка ${bytes} зн.`)
    return { ok: true, error: null, bytes, count: value.runs.length, events: saved.events.length }
  } catch (e) {
    try { log(`[timeline] прохождение НЕ сохранено на сервер: ${msgOf(e)} — игра от сервера не зависит, таймлайн этого сеанса остаётся на устройстве`) } catch { /* журнал не мешает */ }
    return { ok: false, error: msgOf(e), bytes: 0, count: 0, events: 0 }
  }
}

/**
 * Записать черновик правок монтажа draft ({ v, savedAt, edits }) к прохождению run (запись сервера или упакованное прохождение — timelineStore.packRun). Прохождения на сервере ещё нет — оно дописывается вместе
 * с черновиком. Конфликт двух устройств не решаем: прав последний записавший. → { ok, error }; не бросает.
 */
export async function saveTimelineEdits(run, draft, { client = supabase, log = pLog } = {}) {
  try {
    const cur = await client.from('app_settings').select('value').eq('key', TIMELINE_KEY).maybeSingle()
    if (cur.error) throw cur.error
    const value = mergeRuns(cur.data?.value, { ...(runsOf(cur.data?.value).find(r => r.id === run.id) ?? run), edits: draft })
    dbg('[DB WRITE] app_settings', TIMELINE_KEY, 'черновик правок монтажа')
    const { data, error } = await client.from('app_settings').upsert({ key: TIMELINE_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }).select('key')
    if (error) throw error
    if (!data?.length) throw new Error('сервер не подтвердил запись (нужны права админа)')
    return { ok: true, error: null, count: draft?.edits?.length ?? 0 }
  } catch (e) {
    try { log(`[timeline] черновик правок монтажа НЕ сохранён на сервер: ${msgOf(e)} — он остаётся на этом устройстве`) } catch { /* журнал не мешает */ }
    return { ok: false, error: msgOf(e), count: 0 }
  }
}
