import { normalizeSceneV2, isObj } from '../../scene/v2/sceneSchemaV2.js'

// Резервная копия черновика сборщика в localStorage: правки не теряются при обрыве
// связи, закрытии вкладки или если таблицы scenes ещё нет в БД. Один черновик на
// устройство. storage передаётся параметром, чтобы тестировать без браузера.
// Запись: { scene, savedId (uuid строки в БД или null), title, at (ISO) }.

export const BACKUP_KEY = 'pithy_scene_builder_draft_v1'

function store(storage) {
  if (storage) return storage
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function saveBackup({ scene, savedId = null }, storage) {
  const s = store(storage)
  if (!s || !scene) return false
  try {
    s.setItem(BACKUP_KEY, JSON.stringify({ scene, savedId, title: scene.title ?? '', at: new Date().toISOString() }))
    return true
  } catch { return false } // переполнение/приватный режим — молча
}

// null — копии нет или она битая (тогда она удаляется). Невалидная по правилам сцена —
// нормальный черновик на полпути (пустое имя, одна реплика): её сохраняем и возвращаем
export function loadBackup(storage) {
  const s = store(storage)
  if (!s) return null
  try {
    const raw = s.getItem(BACKUP_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!isObj(data?.scene)) { s.removeItem(BACKUP_KEY); return null }
    return { scene: normalizeSceneV2(data.scene), savedId: data.savedId ?? null, at: data.at ?? null }
  } catch {
    try { s.removeItem(BACKUP_KEY) } catch { /* ничего */ }
    return null
  }
}

export function clearBackup(storage) {
  const s = store(storage)
  try { s?.removeItem(BACKUP_KEY) } catch { /* ничего */ }
}

export function formatBackupTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
