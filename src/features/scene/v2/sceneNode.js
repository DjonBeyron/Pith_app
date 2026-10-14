import { normalizeSceneV2 } from './sceneSchemaV2.js'
import { validateSceneV2 } from './sceneValidate.js'
import { isObj } from './sceneConstants.js'

// Нода урока `scene` — формат typeData.scene (общий для плеера, канваса и
// lesson-io):
//   { scene: <снимок сцены v2 целиком>, sceneId?: uuid строки библиотеки,
//     sceneUpdatedAt?: ISO updated_at строки на момент снимка,
//     mode: 'bubble' | 'circle', showBubbles: boolean (по умолчанию true) }
// Снимок встроен в урок намеренно: урок играет офлайн, экспортируется и не
// зависит от статуса published в таблице scenes; sceneId — только связь
// «откуда взяли», чтобы предложить обновить снимок из библиотеки.

export const SCENE_MODES = ['bubble', 'circle']
export const SCENE_MAX_BYTES = 64 * 1024 // как CHECK в таблице scenes

export function sceneDataOf(node) {
  const td = node?.typeData?.scene
  return isObj(td) ? td : {}
}

export function normalizeSceneMode(mode) {
  return SCENE_MODES.includes(mode) ? mode : 'bubble'
}

export function sceneByteSize(scene) {
  try { return new TextEncoder().encode(JSON.stringify(scene ?? null)).length } catch { return 0 }
}

// Данные ноды → { scene: нормализованная сцена | null, errors: [строки], mode, showBubbles }.
// errors пустой и scene null — сцена просто не выбрана (пустая нода).
export function resolveSceneNode(td) {
  const data = isObj(td) ? td : {}
  const mode = normalizeSceneMode(data.mode)
  const showBubbles = data.showBubbles !== false
  if (!isObj(data.scene)) return { scene: null, errors: [], mode, showBubbles }
  const errors = validateSceneV2(data.scene)
  if (sceneByteSize(data.scene) > SCENE_MAX_BYTES) errors.push(`Сцена больше ${SCENE_MAX_BYTES / 1024} КБ`)
  return { scene: errors.length ? null : normalizeSceneV2(data.scene), errors, mode, showBubbles }
}

// Ссылки на заранее записанную озвучку реплик (для прогрева плеера и файлов карточки повтора)
export function sceneAudioUrls(scene) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  return [...new Set(tl.map(l => (typeof l?.audioUrl === 'string' ? l.audioUrl : null)).filter(Boolean))]
}

// Снимок для ноды из строки библиотеки (таблица scenes)
export function snapshotFromRow(row) {
  if (!row || !isObj(row.scene)) return null
  return { scene: row.scene, sceneId: row.id ?? null, sceneUpdatedAt: row.updated_at ?? null }
}

// В библиотеке версия новее снимка ноды? (нет sceneId — сравнивать нечего)
export function libraryHasNewer(td, row) {
  if (!td?.sceneId || !row || row.id !== td.sceneId) return false
  if (!row.updated_at) return false
  return row.updated_at !== (td.sceneUpdatedAt ?? null)
}

// Короткая сводка для пикера/фолбэка: «Название · N реплик»
export function sceneSummary(scene) {
  if (!scene) return 'сцена не выбрана'
  const n = scene.timeline?.length ?? 0
  const word = n % 10 === 1 && n % 100 !== 11 ? 'реплика' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'реплики' : 'реплик'
  return `${scene.title?.trim() || scene.id || 'Сцена'} · ${n} ${word}`
}

// Текст реплик для фолбэка (сцена невалидна — показываем диалог текстом):
// берём как есть из сырого объекта, не требуя валидности
export function rawSceneLines(raw) {
  const tl = Array.isArray(raw?.timeline) ? raw.timeline : []
  return tl
    .map(l => (isObj(l) && typeof l.text === 'string' && l.text.trim()
      ? { who: l.who === 'b' ? 'b' : 'a', name: raw?.characters?.[l.who]?.name, text: l.text.trim() }
      : null))
    .filter(Boolean)
}
