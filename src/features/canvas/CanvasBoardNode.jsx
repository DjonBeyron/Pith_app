import CanvasNode from './CanvasNode.jsx'
import NodeNoteLayer from './NodeNoteLayer.jsx'
import NodeHoverMenu from './NodeHoverMenu.jsx'

// Одна нода на холсте вместе со всем, что висит вокруг неё: стикер-комментарий
// продакшена и меню-липучка при наведении. Вынесено из CanvasBoard.jsx —
// там это была самая длинная часть разметки, а сама доска отвечает за
// протяжку/зум/выделение, а не за содержимое отдельной карточки.
//
// Обёртка НЕ memo: она перерисовывается вместе с доской ровно так же, как
// раньше перерисовывался этот же JSX внутри map. Экономия по-прежнему живёт
// уровнем ниже — в CanvasNode (React.memo), которому сюда передаются те же
// стабильные пропсы, что и раньше.
export default function CanvasBoardNode({
  node, spot, selected, hovered, confirmDelete, isAdmin,
  onEnter, onUpdate, onDragStart, wasDragged,
  allNodes, lessonFiles, onPickLessonFile, onRemoveLessonFile, lessonXp,
  onTriggerMeasure, moduleLessons, dimmed,
  // Стикер-комментарий продакшена
  noteBox, onNoteBoxChange, onNoteBoxClear, scaleRef, noteFolded, noteOpen, onFoldNote, onToggleNote,
  // Меню-липучка
  onPlayFrom, onAdd, onDuplicate, onAskDelete, onDelete, onCancelDelete,
}) {
  return (
    <div
      className={`canvasNodeWrapper${spot ? ' canvasNodeWrapperSpot' : ''}`}
      style={{ left: node.x, top: node.y }}
      onMouseEnter={onEnter}
    >
      <CanvasNode
        node={node}
        onUpdate={onUpdate}
        onDragStart={onDragStart}
        selected={selected}
        wasDragged={wasDragged}
        allNodes={allNodes}
        lessonFiles={lessonFiles}
        onPickLessonFile={onPickLessonFile}
        onRemoveLessonFile={onRemoveLessonFile}
        lessonXp={lessonXp}
        onTriggerMeasure={onTriggerMeasure}
        moduleLessons={moduleLessons}
        dimmed={dimmed}
      />
      {isAdmin && node.note != null && (
        <NodeNoteLayer
          node={node}
          box={noteBox}
          scaleRef={scaleRef}
          folded={noteFolded}
          onChange={value => onUpdate(node.id, { note: value })}
          onBoxChange={onNoteBoxChange}
          onFold={onFoldNote}
          onRemove={() => {
            // Заметку с текстом просто так не теряем — рядом есть «свернуть»
            if (node.note?.trim() && !window.confirm('Удалить комментарий продакшена?')) return
            onUpdate(node.id, { note: undefined })
            onNoteBoxClear()
          }}
        />
      )}
      {hovered && (
        <NodeHoverMenu
          isAdmin={isAdmin}
          confirmDelete={confirmDelete}
          hasNote={node.note != null}
          noteOpen={noteOpen}
          onPlayFrom={onPlayFrom}
          onAdd={onAdd}
          onToggleNote={onToggleNote}
          onDuplicate={onDuplicate}
          onAskDelete={onAskDelete}
          onDelete={onDelete}
          onCancelDelete={onCancelDelete}
        />
      )}
    </div>
  )
}
