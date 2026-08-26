// Меню-липучка над нодой: появляется по наведению и висит, пока не кликнут
// вне ноды. Вынесено из CanvasBoard.jsx — там оно занимало треть разметки.
//
// Кнопки: ▶ прогнать сценарий с этой ноды (только админ), + вставить ноду
// после, ✎ комментарий продакшена (только админ — ученик его не видит
// нигде), ⧉ дублировать, × удалить (с подтверждением прямо в меню).
export default function NodeHoverMenu({
  isAdmin, confirmDelete, hasNote, noteOpen,
  onPlayFrom, onAdd, onToggleNote, onDuplicate, onAskDelete, onDelete, onCancelDelete,
}) {
  return (
    <div className="nodeHoverMenu" onMouseDown={e => e.stopPropagation()}>
      {confirmDelete ? (
        <>
          <span className="nodeHoverConfirm">Удалить?</span>
          <button className="nodeHoverBtn nodeHoverBtnDel"
            onClick={e => { e.stopPropagation(); onDelete() }}>Да</button>
          <button className="nodeHoverBtn"
            onClick={e => { e.stopPropagation(); onCancelDelete() }}>Нет</button>
        </>
      ) : (
        <>
          {isAdmin && onPlayFrom && (
            <button className="nodeHoverBtn nodeHoverBtnPlay" title="Пройти сценарий с этой ноды"
              onClick={e => { e.stopPropagation(); onPlayFrom() }}>▶</button>
          )}
          <button className="nodeHoverBtn nodeHoverBtnAdd" title="Вставить ноду после"
            onClick={e => { e.stopPropagation(); onAdd(e) }}>+</button>
          {isAdmin && (
            <button
              className={`nodeHoverBtn nodeHoverBtnNote${hasNote ? ' nodeHoverBtnNoteOn' : ''}`}
              title={!hasNote
                ? 'Комментарий продакшена: заметка к ноде, видна только админу в канвасе'
                : noteOpen ? 'Скрыть комментарий продакшена' : 'Показать комментарий продакшена'}
              onClick={e => { e.stopPropagation(); onToggleNote() }}
            >✎</button>
          )}
          <button className="nodeHoverBtn nodeHoverBtnDup" title="Дублировать ноду"
            onClick={e => { e.stopPropagation(); onDuplicate() }}>⧉</button>
          <button className="nodeHoverBtn nodeHoverBtnDel" title="Удалить ноду"
            onClick={e => { e.stopPropagation(); onAskDelete() }}>×</button>
        </>
      )}
    </div>
  )
}
