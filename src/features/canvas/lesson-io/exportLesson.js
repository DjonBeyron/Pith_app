import { FORMAT, SCHEMA_VERSION, NODE_DOCS, buildLegend } from './lessonSchema.js'
import { getVariantList } from '../nodeVariants.js'

// Урок → обменный JSON. Отдаём всю логику сценария и ни одного байта медиа:
// вместо файлов — пометка needs («сюда нужна озвучка»), а всё, что считается
// из файла (волна, длительность, тайминги слов, кадрирование), просто
// выбрасывается — редактор пересчитает это сам при загрузке файла.

// Поля data, которые не несут смысла без файла
const FILE_FIELDS = ['file_id', 'photoUrl', 'waveformData', 'wordTimings', 'duration']

const isEmpty = v =>
  v == null || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)

// id внутри урока (uuid вариантов, ячеек, слоёв) для чтения бесполезны, но
// для таблицы они несущие: timeline ссылается на cellId. Поэтому у таблицы
// id ячеек сохраняем, у остальных — вычищаем.
function stripIds(value, keepIds) {
  if (Array.isArray(value)) return value.map(v => stripIds(v, keepIds))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === 'id' && !keepIds) continue
      if (FILE_FIELDS.includes(k)) continue
      if (isEmpty(v)) continue
      out[k] = stripIds(v, keepIds)
    }
    return out
  }
  return value
}

function exportData(node) {
  const raw = node.typeData?.[node.type] ?? {}
  const keepIds = node.type === 'table'   // timeline ссылается на cellId
  const data = {}
  for (const [k, v] of Object.entries(raw)) {
    if (FILE_FIELDS.includes(k)) continue
    if (isEmpty(v)) continue
    data[k] = stripIds(v, keepIds)
  }
  return data
}

// Переходы: then заменяем на ref, у особых переходов по варианту добавляем
// подпись — по uuid не понять, о каком слове речь
function exportTriggers(node, refOf) {
  const variants = new Map(getVariantList(node.type, node.typeData?.[node.type] ?? {})
    .map(v => [v.id, v.label]))
  return (node.triggers ?? []).map(t => {
    const label = variants.get(t.if)
    return {
      if: label ? 'variant' : t.if,
      ...(label ? { variantLabel: label } : {}),
      ...(t.ms != null ? { ms: t.ms } : {}),
      ...(t.offsetOn ? { offsetMs: t.offsetMs ?? 0 } : {}),
      then: t.then ? refOf.get(t.then) ?? null : null,
    }
  })
}

// Какой файл нужен именно ЭТОЙ ноде: у таблицы озвучка нужна только режиму
// dictator, в ручном и «показе» её нет вовсе
function needsOf(node) {
  const base = NODE_DOCS[node.type]?.needs
  if (!base) return null
  if (node.type === 'table') {
    return (node.typeData?.table?.mode ?? 'dictator') === 'dictator' ? base : null
  }
  return base
}

export function exportLesson(nodes, { title = '', lessonId = null, includeLegend = true } = {}) {
  const list = [...(nodes ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const refOf = new Map(list.map((n, i) => [n.id, `n${i + 1}`]))

  return {
    format: FORMAT,
    version: SCHEMA_VERSION,
    lesson: { title, ...(lessonId ? { lessonId } : {}), nodeCount: list.length },
    ...(includeLegend ? { legend: buildLegend() } : {}),
    nodes: list.map(n => {
      const data = exportData(n)
      const needs = needsOf(n)
      return {
        ref: refOf.get(n.id),
        type: n.type,
        seq: n.seq,
        pos: [Math.round(n.x ?? 0), Math.round(n.y ?? 0)],
        ...(n.size && n.size !== 'max' ? { size: n.size } : {}),
        ...(n.note ? { note: n.note } : {}),
        ...(needs ? { needs } : {}),
        ...(Object.keys(data).length ? { data } : {}),
        triggers: exportTriggers(n, refOf),
      }
    }),
  }
}

export function exportLessonText(nodes, opts) {
  return JSON.stringify(exportLesson(nodes, opts), null, 2)
}
