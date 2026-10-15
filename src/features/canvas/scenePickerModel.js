import { lintScene } from '../scene/v2/sceneLint.js'
import { snapshotFromRow, sceneByteSize, SCENE_MAX_BYTES, sceneNodeOverrides } from '../scene/v2/sceneNode.js'
import { isDisplayMode } from '../scene/v2/sceneOptions.js'
import { sceneVoiceStats } from '../scene/v2/sceneVoice.js'
import { isObj } from '../scene/v2/sceneConstants.js'

// Чистая логика пикера ноды scene (NodeScenePicker.jsx): поиск по библиотеке,
// патчи typeData, сводка линтера — без React, чтобы тестировать отдельно.

// Поиск по названию и id сцены, без учёта регистра
export function filterSceneRows(rows, query) {
  const q = String(query ?? '').trim().toLowerCase()
  const list = Array.isArray(rows) ? rows : []
  if (!q) return list
  return list.filter(r => `${r.title ?? ''} ${r.scene?.id ?? ''}`.toLowerCase().includes(q))
}

// Патч typeData при выборе строки библиотеки: снимок + связь с источником
export function pickRowPatch(row) {
  const snap = snapshotFromRow(row)
  return snap ? { ...snap } : null
}

// Патч typeData при «Применить» из встроенного сборщика: снимок без связи с
// библиотекой (сцена правилась для этой ноды; сохранять в библиотеку — отдельно).
// keepLink — сборщик открыли из снимка библиотеки и ничего не меняли → связь остаётся
export function applyBuilderPatch(scene, { prevTd = null } = {}) {
  const unchanged = prevTd?.sceneId && JSON.stringify(prevTd.scene) === JSON.stringify(scene)
  return unchanged ? { scene } : { scene, sceneId: null, sceneUpdatedAt: null }
}

export function clearScenePatch() {
  return { scene: null, sceneId: null, sceneUpdatedAt: null }
}

// Сводка проверки для индикатора: { errors: [], warns: [], bytes, tooBig }
export function sceneCheck(scene) {
  if (!scene) return { errors: [], warns: [], bytes: 0, tooBig: false }
  const lint = lintScene(scene)
  const bytes = sceneByteSize(scene)
  // Размер > 64 КБ линтер (sceneLint.lintSize) уже выдаёт ошибкой — не дублируем
  const errors = lint.filter(x => x.level === 'error').map(x => x.text)
  return { errors, warns: lint.filter(x => x.level === 'warn').map(x => x.text), bytes, tooBig: bytes > SCENE_MAX_BYTES }
}

// Переопределения ноды (typeData.scene.display / .voice по контракту sceneNode.js): null —
// «как в сцене» = поле не задано (undefined; merge typeData через spread, JSON его не пишет).
// display пишется вместе со старым showBubbles (false ↔ 'none'), чтобы старый плеер видел то же
export function nodeDisplayPatch(value) {
  if (!isDisplayMode(value)) return { display: undefined, showBubbles: true }
  return { display: value, showBubbles: value !== 'none' }
}

// value: true | false | null («как в сцене»); voice остаётся неполным объектом или undefined
export function nodeVoicePatch(td, key, value) {
  const cur = isObj(td?.voice) ? { ...td.voice } : {}
  if (typeof value === 'boolean') cur[key] = value; else delete cur[key]
  return { voice: Object.keys(cur).length ? cur : undefined }
}

// Текущее состояние контролов ноды: display null — как в сцене; voice.<k> null — как в сцене
export function nodeModeState(td) {
  const o = sceneNodeOverrides(td)
  return { display: o.display, original: o.voice?.original ?? null, translation: o.voice?.translation ?? null }
}

// Сводка озвучки по наборам: «озвучено: оригинал X/N · перевод Y/M» (M — реплик с переводом)
export function voiceSummary(scene) {
  const st = sceneVoiceStats(scene)
  if (!st.total) return ''
  const tr = st.translation
  return `озвучено: оригинал ${st.ready}/${st.total}${tr.withText ? ` · перевод ${tr.ready}/${tr.withText}` : ''}${st.stale + tr.stale ? ` · устарело ${st.stale + tr.stale}` : ''}`
}

// Озвучка сцены: все реплики с файлом / часть / браузерный синтез
export function voiceLabel(scene) {
  const tl = scene?.timeline ?? []
  if (!tl.length) return ''
  const withFile = tl.filter(l => l?.audioUrl).length
  if (withFile === tl.length) return 'озвучка: файлы'
  if (withFile) return `озвучка: файлы у ${withFile} из ${tl.length}`
  return 'озвучка: браузерная'
}
