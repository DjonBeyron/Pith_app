import { NODE_TYPES } from '../../canvas/nodeTypes.js'

const TYPE_LABEL = Object.fromEntries(NODE_TYPES.map(t => [t.value, t.label]))

// Текст ноды лежит в разных полях у разных типов (исторически): у голосового
// это подпись к аудио, у стикера — подпись под картинкой, у таблицы — задание.
const TEXT_FIELDS = ['content', 'text', 'caption', 'question', 'title', 'prompt']

function nodeText(node) {
  const d = node.typeData?.[node.type] ?? {}
  for (const f of TEXT_FIELDS) {
    if (typeof d[f] === 'string' && d[f].trim()) return d[f].trim().replace(/\s+/g, ' ')
  }
  return ''
}

// Подпись ноды в списке правой панели: «#3 · Голосовое сообщение · Привет…»
export function nodeEditLabel(node) {
  const type = TYPE_LABEL[node.type] ?? node.type
  const text = nodeText(node)
  const short = text.length > 40 ? `${text.slice(0, 40)}…` : text
  return `#${node.seq} · ${type}${short ? ` · ${short}` : ''}`
}
