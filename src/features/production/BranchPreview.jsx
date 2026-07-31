import { TYPE_COLOR, NODE_TYPES } from '../canvas/nodeTypes.js'
import { previewNodeText } from './nodeGraphPrimary.js'

// Карточка ветки сбоку от строки, у которой есть развилка (например
// word_choice: верно/неверно) — короткое превью ноды-цели без перехода на
// canvas, с кнопкой прыжка к ней в этом же списке (она там уже есть, список
// её не дублирует для редактирования — только показывает, что там).
export default function BranchPreview({ label, node, onJump }) {
  if (!node) return null
  const color = TYPE_COLOR[node.type] ?? TYPE_COLOR.text
  const typeLabel = NODE_TYPES.find(t => t.value === node.type)?.label ?? node.type
  const preview = previewNodeText(node)

  return (
    <div className="branchCol">
      <span className="branchColLabel">{label}</span>
      <button
        className="branchPreview"
        // Приглушённая обводка (смешана с фоном) — как у NodeTypeSelect,
        // чистый цвет типа на всю яркость слепит; полоса сверху — чётким цветом
        style={{ borderColor: `color-mix(in srgb, ${color} 40%, #12141a)` }}
        onClick={onJump}
      >
        <span className="branchPreviewBar" style={{ background: color }} />
        <span className="branchPreviewHead">
          <span className="branchPreviewSeq">#{node.seq}</span>
          <span className="branchPreviewType">{typeLabel}</span>
        </span>
        {preview && <span className="branchPreviewText">{preview}</span>}
        <span className="branchPreviewJump">↷ перейти к ноде</span>
      </button>
    </div>
  )
}
