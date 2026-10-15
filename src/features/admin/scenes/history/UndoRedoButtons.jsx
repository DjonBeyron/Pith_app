import { Undo2, Redo2 } from 'lucide-react'

// «↶ Отменить» / «↷ Повторить» в тулбаре сборщика — группа слева после «Назад». Подсказка и aria-label
// называют шаг: «Отменить: удаление реплики 3 (Ctrl+Z)». Пустой стек — кнопка disabled.
// ctl — useUndoControls.
export default function UndoRedoButtons({ ctl }) {
  const undoText = ctl.canUndo ? `Отменить: ${ctl.undoLabel}` : 'Отменить'
  const redoText = ctl.canRedo ? `Повторить: ${ctl.redoLabel}` : 'Повторить'
  return (
    <div className="scbTbGroup scbTbUndo" role="group" aria-label="История правок">
      <button type="button" className="scbTbIcon" data-action="undo" onClick={ctl.undo} disabled={!ctl.canUndo} aria-label={undoText} title={`${undoText} (Ctrl+Z)`}>
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button type="button" className="scbTbIcon" data-action="redo" onClick={ctl.redo} disabled={!ctl.canRedo} aria-label={redoText} title={`${redoText} (Ctrl+Shift+Z)`}>
        <Redo2 size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
