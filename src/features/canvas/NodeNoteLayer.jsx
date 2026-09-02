import NodeNoteBox from './NodeNoteBox.jsx'
import { NODE_HIT_W } from './canvasHitTest.js'
import { linkLine } from './noteBoxGeom.js'

// Всё, что относится к комментарию продакшена одной ноды: сам стикер, линия
// связи с нодой и метка свёрнутого комментария. Вынесено из CanvasBoard.jsx —
// он у потолка размера файла.
//
// Линия появляется, только когда стикер сдвинули с места по умолчанию: пока он
// стоит вплотную справа, хватает короткого хвостика (CSS ::before). Рисуется
// ПОД нодой и под стикером, поэтому не перечёркивает ни текст, ни саму ноду.
export default function NodeNoteLayer({ node, box, scaleRef, folded, onChange, onBoxChange, onFold, onRemove }) {
  if (node.note == null) return null

  if (folded) {
    return (
      <span className="nodeNoteDot" title="У ноды есть комментарий продакшена (свёрнут)">✎</span>
    )
  }

  const nodeW = NODE_HIT_W[node.size] ?? 158
  const line = box ? linkLine({ w: nodeW, h: 48 }, box) : null

  return (
    <>
      {line && (
        <svg className="nodeNoteLink" width="1" height="1">
          <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        </svg>
      )}
      <NodeNoteBox
        note={node.note}
        box={box}
        scaleRef={scaleRef}
        onChange={onChange}
        onBoxChange={onBoxChange}
        onFold={onFold}
        onRemove={onRemove}
      />
    </>
  )
}
