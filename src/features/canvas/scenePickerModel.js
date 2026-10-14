import { lintScene } from '../scene/v2/sceneLint.js'
import { snapshotFromRow, sceneByteSize, SCENE_MAX_BYTES } from '../scene/v2/sceneNode.js'

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
  const errors = lint.filter(x => x.level === 'error').map(x => x.text)
  if (bytes > SCENE_MAX_BYTES) errors.push(`Сцена больше ${SCENE_MAX_BYTES / 1024} КБ (${Math.round(bytes / 1024)} КБ)`)
  return { errors, warns: lint.filter(x => x.level === 'warn').map(x => x.text), bytes, tooBig: bytes > SCENE_MAX_BYTES }
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
