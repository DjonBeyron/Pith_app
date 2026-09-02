import { dbg } from '../../../shared/lib/debug.js'
import { checkNodes, formatIntegrity } from '../canvasIntegrity.js'
import { FORMAT } from './lessonSchema.js'
import { NODE_TYPES } from '../nodeTypes.js'
import { makeNode, renumber, NODE_SLOT } from '../nodeGraph.js'

// Обменный JSON → ноды урока. Обратная сторона exportLesson.js: восстанавливаем
// сценарий целиком, кроме файлов — их автор подкладывает в редакторе, ноды
// помечены needs.
//
// Внутренние id (варианты ответа, ячейки, слои) в обмене не участвуют, поэтому
// генерируем их заново; особые переходы по варианту привязываются обратно по
// подписи (variantLabel), а не по id.

const KNOWN_TYPES = new Set(NODE_TYPES.map(t => t.value))
const uid = () => crypto.randomUUID()

// Где у типа лежит список вариантов и по какому полю его узнавать в подписи
const VARIANT_FIELD = {
  word_choice:     ['options', 'text'],
  photo_choice:    ['photos', 'label'],
  phrase_assembly: ['distractors', 'text'],
  table:           ['distractors', 'text'],
}

function withIds(type, data) {
  const out = { ...data }
  const [field] = VARIANT_FIELD[type] ?? []
  if (field && Array.isArray(out[field])) {
    out[field] = out[field].map(v => (typeof v === 'string'
      ? { id: uid(), text: v }
      : { id: v.id ?? uid(), ...v }))
  }
  // Таблица: сетке нужны id колонок, строк и ячеек — на cellId ссылается монтаж
  if (type === 'table' && out.table) {
    const t = out.table
    out.table = {
      ...t,
      columns: (t.columns ?? []).map(c => ({ id: c.id ?? uid(), ...c })),
      rows:    (t.rows ?? []).map(r => ({ id: r.id ?? uid(), ...r })),
      cells:   (t.cells ?? []).map(c => ({
        id: c.id ?? uid(), rowspan: 1, colspan: 1, value: '', ...c,
      })),
    }
  }
  return out
}

// Особый переход по варианту (if: 'variant' + variantLabel) снова становится
// триггером с id этого варианта
function variantIdByLabel(type, data, label) {
  const [field, key] = VARIANT_FIELD[type] ?? []
  if (!field || !label) return null
  const found = (data?.[field] ?? []).find(v => (v?.[key] ?? '') === label)
  return found?.id ?? null
}

export function importLesson(input, { startX = 120, startY = 80 } = {}) {
  const json = typeof input === 'string' ? JSON.parse(input) : input
  if (!json || typeof json !== 'object') throw new Error('Это не JSON-объект')
  if (json.format && json.format !== FORMAT) {
    throw new Error(`Чужой формат: ${json.format}. Ожидался ${FORMAT}`)
  }
  if (!Array.isArray(json.nodes) || !json.nodes.length) {
    throw new Error('В файле нет массива nodes')
  }

  dbg('[IMPORT] разбираю файл:', `${json.nodes.length} нод`, `формат ${json.format ?? '—'}`)

  const warnings = []
  const idByRef = new Map()
  const built = []

  json.nodes.forEach((raw, i) => {
    const ref = raw.ref ?? `n${i + 1}`
    if (!KNOWN_TYPES.has(raw.type)) {
      warnings.push(`${ref}: неизвестный тип «${raw.type}» — нода пропущена`)
      return
    }
    const [x, y] = Array.isArray(raw.pos) ? raw.pos : [startX + built.length * NODE_SLOT, startY]
    const node = makeNode(built.length + 1, x, y, raw.type)
    const data = withIds(raw.type, raw.data ?? {})
    node.typeData = { ...node.typeData, [raw.type]: { ...node.typeData[raw.type], ...data } }
    if (raw.size) node.size = raw.size
    if (raw.note != null) node.note = raw.note
    idByRef.set(ref, node.id)
    built.push({ node, raw, ref })
  })

  // Второй проход: переходы — все ноды уже есть, ref-ы известны
  for (const { node, raw, ref } of built) {
    const list = Array.isArray(raw.triggers) ? raw.triggers : []
    if (!list.length) continue
    const data = node.typeData[node.type]
    node.triggers = list.map(t => {
      const ifKey = t.if === 'variant'
        ? variantIdByLabel(node.type, data, t.variantLabel)
        : t.if
      if (t.if === 'variant' && !ifKey) {
        warnings.push(`${ref}: не нашёл вариант «${t.variantLabel}» — особый переход пропущен`)
      }
      let then = null
      if (t.then) {
        then = idByRef.get(t.then) ?? null
        if (!then) warnings.push(`${ref}: переход на неизвестную ноду «${t.then}»`)
      }
      return {
        id: uid(),
        if: ifKey ?? t.if,
        ...(t.ms != null ? { ms: t.ms } : {}),
        ...(t.offsetMs != null ? { offsetOn: true, offsetMs: t.offsetMs } : {}),
        then,
      }
    }).filter(t => t.if)
  }

  const nodes = renumber(built.map(b => b.node))
  const links = nodes.reduce((sum, n) => sum + (n.triggers ?? []).filter(t => t.then).length, 0)
  // Файл без единой связи — обычно это не «такой сценарий», а забытые then:
  // ноды приедут, но останутся россыпью, и понять это по холсту трудно
  if (nodes.length > 1 && links === 0) {
    warnings.push('В файле нет ни одной связи между нодами (then у всех триггеров пустой)')
  }

  // replyToSeq — сырой номер seq, а не ref: в отличие от триггеров его никто
  // не проверяет автоматически. Ловим два случая брака: ссылка на
  // несуществующий seq и ссылка вперёд (цитата на то, что ещё не прозвучало)
  for (const n of nodes) {
    const replyToSeq = n.typeData?.[n.type]?.replyToSeq
    if (!replyToSeq) continue
    const target = nodes.find(t => t.seq === replyToSeq)
    if (!target) {
      warnings.push(`#${n.seq} ${n.type}: replyToSeq ${replyToSeq} — такой ноды нет`)
    } else if (replyToSeq >= n.seq) {
      warnings.push(`#${n.seq} ${n.type}: replyToSeq ${replyToSeq} указывает вперёд по сценарию — цитата должна быть на уже прозвучавшее`)
    }
  }

  const health = checkNodes(nodes)
  dbg('[IMPORT] собрано:', `${nodes.length} нод`, `${links} связей`,
    warnings.length ? `предупреждений ${warnings.length}` : 'без предупреждений')
  dbg('[IMPORT]', formatIntegrity(health))

  return {
    nodes,
    links,
    warnings,
    title: json.lesson?.title ?? '',
  }
}
