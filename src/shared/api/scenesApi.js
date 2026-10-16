import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// Библиотека сцен конструктора (таблица scenes, миграция 20261014140000_scenes.sql).
// Строка: { id, title, scene (jsonb v2), status 'draft' | 'published', created_by,
// created_at, updated_at }. Пишет только админ (RLS), читает: админ — всё, остальные —
// published. Ошибки пробрасываются наверх; isMissingTable(err) — таблицы ещё нет в БД
// (миграция не применена) — сборщик тогда работает с локальным черновиком.

export const SCENES_TABLE = 'scenes'
// scene_vars — только слова-переменные сцены (jsonb-путь, не вся сцена): пометка «шаблон · N слов» в списке библиотеки
const LIST_COLS = 'id, title, status, created_at, updated_at, scene_vars:scene->vars'

export function isMissingTable(err) {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205') return true
  return /relation .*scenes.* does not exist|could not find the table .*scenes/i.test(err.message ?? '')
}

export function isRightsError(err) {
  return /permission|policy|row-level|не применилось|403|401/i.test(err?.message ?? '') || err?.code === '42501'
}

function must(res, what) {
  if (res.error) { dbg(`[DB ERROR] scenes ${what}`, res.error.message); throw res.error }
  return res.data
}

export async function listScenes() {
  dbg('[DB READ] scenes list')
  const res = await supabase.from(SCENES_TABLE).select(LIST_COLS).order('updated_at', { ascending: false }).limit(200)
  return must(res, 'list') ?? []
}

export async function getScene(id) {
  dbg('[DB READ] scenes get', id)
  const res = await supabase.from(SCENES_TABLE).select('*').eq('id', id).maybeSingle()
  return must(res, 'get')
}

// Сцены для ленты (feed/scene/feedSceneStore.js): только нужные id одним запросом и только
// опубликованные — черновик в ленту не попадает и у админа (как с модулями). Строки, которых
// нет в ответе (не опубликована, удалена, RLS) — лента считает «нет сцены» и показывает видео
export async function fetchScenesByIds(ids) {
  const list = [...new Set((ids ?? []).filter(Boolean))]
  if (!list.length) return []
  dbg('[DB READ] scenes by ids', list.length)
  const res = await supabase.from(SCENES_TABLE).select('id, scene, updated_at').in('id', list).eq('status', 'published')
  return must(res, 'byIds') ?? []
}

// Новая строка; возвращает её целиком. Без .select() RLS-отказ выглядел бы как успех
export async function createScene({ title, scene, status = 'draft' }) {
  dbg('[DB WRITE] scenes insert')
  const res = await supabase.from(SCENES_TABLE).insert({ title, scene, status }).select('*').single()
  return must(res, 'insert')
}

export async function updateScene(id, { title, scene, status }) {
  dbg('[DB WRITE] scenes update', id)
  const patch = {}
  if (title !== undefined) patch.title = title
  if (scene !== undefined) patch.scene = scene
  if (status !== undefined) patch.status = status
  const res = await supabase.from(SCENES_TABLE).update(patch).eq('id', id).select('*')
  const rows = must(res, 'update')
  if (!rows?.length) throw new Error('Сохранение не применилось: сервер не подтвердил запись')
  return rows[0]
}

// id есть → update, нет → insert
export function saveScene({ id, title, scene, status }) {
  return id ? updateScene(id, { title, scene, status }) : createScene({ title, scene, status })
}

// Копия строки: makeCopy(scene) → сцена-копия (feature-слой решает название «… (копия)» и новый id, см. scene/v2/sceneNaming.js
// asCopy); колонка title = scene.title копии. Без makeCopy — копия как есть
export async function duplicateScene(id, makeCopy = s => s) {
  const row = await getScene(id)
  if (!row) throw new Error('Сцена не найдена')
  const scene = makeCopy({ ...row.scene, title: row.title })
  return createScene({ title: scene.title, scene, status: 'draft' })
}

export async function deleteScene(id) {
  dbg('[DB WRITE] scenes delete', id)
  const res = await supabase.from(SCENES_TABLE).delete().eq('id', id).select('id')
  const rows = must(res, 'delete')
  if (!rows?.length) throw new Error('Удаление не применилось: сервер не подтвердил')
}

// Переименование: колонка title и scene.title в JSON меняются вместе (иначе в списке одно, а в сцене другое);
// title уже очищен вызывающим (cleanTitle)
export async function renameScene(id, title) {
  const row = await getScene(id)
  return updateScene(id, row?.scene ? { title, scene: { ...row.scene, title } } : { title })
}
export const setSceneStatus = (id, status) => updateScene(id, { status })
export const publishScene = id => setSceneStatus(id, 'published')
export const unpublishScene = id => setSceneStatus(id, 'draft')
