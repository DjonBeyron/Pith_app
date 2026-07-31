import NodeContentEditor from '../canvas/NodeContentEditor.jsx'
import NodeTypeSelect from '../canvas/NodeTypeSelect.jsx'
import { TYPE_COLOR } from '../canvas/nodeTypes.js'

// Одна карточка ноды — переиспользуется и для обычной строки списка, и для
// каждой из двух колонок при развилке (ProductionList.jsx), чтобы не
// дублировать разметку в трёх местах.
export default function ProductionRow({
  node, isDragging, dropLineBefore, dropLineAfter,
  onDragOver, onDrop, onHandleDragStart, onHandleDragEnd,
  onUpdate, onTypeChange, onDuplicate, onDelete, onInsertBelow,
  allNodes, lessonFiles, onPickLessonFile, moduleLessons,
}) {
  return (
    <div
      data-node-id={node.id}
      className={'productionRow' + (isDragging ? ' productionRowDragging' : '')}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dropLineBefore && <div className="productionDropLine" />}
      <div className="productionRowBar" style={{ background: TYPE_COLOR[node.type] }} />
      <div className="productionRowHead">
        <span
          className="productionRowHandle"
          title="Перетащить для смены порядка"
          draggable
          onDragStart={onHandleDragStart}
          onDragEnd={onHandleDragEnd}
        >⠿</span>
        <span className="productionRowSeq">#{node.seq}</span>
        <NodeTypeSelect value={node.type} onChange={onTypeChange} compact />
        <button className="productionRowBtn" title="Дублировать" onClick={onDuplicate}>⧉</button>
        <button className="productionRowBtn productionRowBtnDel" title="Удалить" onClick={onDelete}>×</button>
      </div>
      <div
        className="productionRowContent"
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            onInsertBelow()
          }
        }}
      >
        <NodeContentEditor
          node={node}
          onUpdate={onUpdate}
          allNodes={allNodes}
          lessonFiles={lessonFiles}
          onPickLessonFile={onPickLessonFile}
          moduleLessons={moduleLessons}
          showTypeSelect={false}
        />
      </div>
      {dropLineAfter && <div className="productionDropLine" />}
    </div>
  )
}
