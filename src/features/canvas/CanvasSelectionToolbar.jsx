// Плашка над холстом, когда выделено 2+ ноды: кнопка «Удалить N нод» с
// подтверждением прямо в плашке (как «Удалить?» в NodeHoverMenu.jsx, но для
// группы). Не привязана к позиции нод на холсте — висит фиксированно сверху,
// чтобы не зависеть от прокрутки/зума и не перекрывать выделенные ноды.
export default function CanvasSelectionToolbar({ count, confirming, onAskDelete, onDelete, onCancel }) {
  if (count < 2) return null

  return (
    <div className="canvasSelectionToolbar" onMouseDown={e => e.stopPropagation()}>
      {confirming ? (
        <>
          <span className="canvasSelectionToolbarLabel">Удалить {count} нод?</span>
          <button className="canvasSelectionBtn canvasSelectionBtnDel" onClick={onDelete}>Да</button>
          <button className="canvasSelectionBtn" onClick={onCancel}>Нет</button>
        </>
      ) : (
        <>
          <span className="canvasSelectionToolbarLabel">Выделено нод: {count}</span>
          <button className="canvasSelectionBtn canvasSelectionBtnDel" onClick={onAskDelete}>Удалить</button>
        </>
      )}
    </div>
  )
}
