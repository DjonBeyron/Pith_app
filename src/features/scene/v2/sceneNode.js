import { normalizeSceneV2 } from './sceneSchemaV2.js'
import { validateSceneV2 } from './sceneValidate.js'
import { isObj } from './sceneConstants.js'
import { fillSceneVars, usesVars } from './sceneVars.js'
import { hasVarParts, segmentUrls } from './sceneVarsSegments.js'
import { isDisplayMode, resolveDisplay, resolveVoiceFlags } from './sceneOptions.js'
import { normalizeSceneCrop } from './sceneNodeCrop.js'

// Нода урока `scene` — формат typeData.scene (общий для плеера, канваса и
// lesson-io):
//   { scene: <снимок сцены v2 целиком>, sceneId?: uuid строки библиотеки,
//     sceneUpdatedAt?: ISO updated_at строки на момент снимка,
//     mode: 'bubble' | 'circle', showBubbles: boolean (по умолчанию true),
//     start?: 'manual' | 'auto' (по умолчанию 'auto'), startDelayMs?: 0…5000 (по умолчанию 500),
//     display?: 'none' | 'text' | 'both', voice?: { original?, translation? },
//     crop?: { x, y, scale } }  — масштаб/сдвиг кадра как у видео (sceneNodeCrop.js; нет поля = { 0, 0, 1 })
// display/voice — необязательные переопределения на уровне ноды поверх options
// сцены (sceneOptions.js); нет display → старый showBubbles (false → 'none').
// Снимок встроен в урок намеренно: урок играет офлайн, экспортируется и не
// зависит от статуса published в таблице scenes; sceneId — только связь
// «откуда взяли», чтобы предложить обновить снимок из библиотеки.

export const SCENE_MODES = ['bubble', 'circle']
export const SCENE_MAX_BYTES = 64 * 1024 // как CHECK в таблице scenes
// Запуск сцены в ленте: 'auto' — сама стартует через startDelayMs после конца анимации появления
// сообщения (по умолчанию — старые ноды ведут себя как раньше), 'manual' — стоит на паузе с ▶
export const SCENE_STARTS = ['manual', 'auto']
export const SCENE_START_DEFAULT = 'auto'
export const SCENE_START_DELAY_DEFAULT = 500
export const SCENE_START_DELAY_MAX = 5000

export function normalizeSceneStart(start) {
  return SCENE_STARTS.includes(start) ? start : SCENE_START_DEFAULT
}

// Задержка после появления, мс: число 0…5000 (целое); мусор → по умолчанию
export function normalizeStartDelay(ms) {
  const n = typeof ms === 'string' && ms.trim() !== '' ? Number(ms) : ms
  if (typeof n !== 'number' || !Number.isFinite(n)) return SCENE_START_DELAY_DEFAULT
  return Math.min(SCENE_START_DELAY_MAX, Math.max(0, Math.round(n)))
}

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

// Переопределения ноды для SceneRenderer: display (строка или null — решает сцена/showBubbles),
// voice (неполный объект или null). Мусор отбрасывается
export function sceneNodeOverrides(td) {
  const data = isObj(td) ? td : {}
  const voice = isObj(data.voice) && ['original', 'translation'].some(k => typeof data.voice[k] === 'boolean')
    ? Object.fromEntries(Object.entries(data.voice).filter(([k, v]) => ['original', 'translation'].includes(k) && typeof v === 'boolean'))
    : null
  return { display: isDisplayMode(data.display) ? data.display : null, voice }
}

// Данные ноды → { scene: нормализованная сцена (шаблон с vars — со словами-запасными) | null, errors: [строки], mode, showBubbles, display, voice }.
// errors пустой и scene null — сцена просто не выбрана (пустая нода).
// opts.fill=false — шаблон остаётся с vars (без слов): слова пользователя подставляет useSceneUserValues (лента/урок/повтор).
export function resolveSceneNode(td, opts = {}) {
  const data = isObj(td) ? td : {}
  const mode = normalizeSceneMode(data.mode)
  const showBubbles = data.showBubbles !== false
  const base = {
    mode, showBubbles, start: normalizeSceneStart(data.start), startDelayMs: normalizeStartDelay(data.startDelayMs),
    crop: normalizeSceneCrop(data.crop), ...sceneNodeOverrides(data),
  }
  // Кружок — строгое правило: облачков с текстом реплик в нём нет никогда (только кот, голос и кольцо), что бы ни стояло в showBubbles/display
  if (mode === 'circle') { base.showBubbles = false; base.display = 'none' }
  if (!isObj(data.scene)) return { scene: null, errors: [], ...base }
  const errors = validateSceneV2(data.scene)
  if (sceneByteSize(data.scene) > SCENE_MAX_BYTES) errors.push(`Сцена больше ${SCENE_MAX_BYTES / 1024} КБ`)
  // vars: по умолчанию шаблон показывается со словами-запасными (fallback), «{name}» не виден; fill=false — слова подставит вызывающий
  const norm = errors.length ? null : normalizeSceneV2(data.scene)
  return { scene: norm && opts.fill === false ? norm : norm && fillSceneVars(norm), errors, ...base }
}

// Ноде есть что читать без звука? (режим показа текста не 'none' — с учётом showBubbles/display ноды)
export function sceneNodeShowsText(td) {
  const data = isObj(td) ? td : {}
  return resolveDisplay(data.scene, { display: sceneNodeOverrides(data).display, showBubbles: data.showBubbles }) !== 'none'
}

// Файлы озвучки оригинала реплики: у реплики-шаблона (segments) — только файлы сегментов (целиком она не озвучена;
// после подстановки сюда попадают и слова из word_audio); шаблонная реплика без segments — ничего (audioUrl сбросится при подстановке)
export function lineOriginalUrls(scene, l) {
  if (Array.isArray(l?.segments)) return segmentUrls(l)
  if (usesVars(scene) && hasVarParts(l?.text)) return []
  return [l?.audioUrl]
}

// Ссылки на заранее записанную озвучку реплик (для прогрева плеера и файлов карточки повтора):
// оригинал всегда; файлы перевода — только когда озвучка перевода включена (voice ⊕ переопределение)
export function sceneAudioUrls(scene, voiceOverride = null) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  const withTr = resolveVoiceFlags(scene, voiceOverride).translation
  const urls = tl.flatMap(l => [...lineOriginalUrls(scene, l), withTr && !(usesVars(scene) && hasVarParts(l?.translation)) ? l?.translationAudioUrl : null])
  return [...new Set(urls.filter(u => typeof u === 'string' && u))]
}

// То же по сырым данным ноды (прогрев плеера: typeData.scene целиком, с переопределением voice ноды)
export function sceneNodeAudioUrls(td) {
  const data = isObj(td) ? td : {}
  return sceneAudioUrls(data.scene, sceneNodeOverrides(data).voice)
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
  return `${scene.title?.trim() || 'Сцена'} · ${n} ${word}`
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
