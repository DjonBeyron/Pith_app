// Комментарий продакшена — жёлтый стикер, привязанный к ноде на холсте.
//
// Это заметка «для своих»: что доснять, чей голос, какой дубль взять. Живёт
// в самой ноде (node.note), но НИКОГДА не показывается ученику — ни в плеере,
// ни в чате: плеер поле note просто не читает. Видит её только админ и только
// в канвасе (см. CanvasBoard.jsx — рендер под isAdmin).
export default function NodeNoteBox({ note, onChange, onRemove }) {
  return (
    <div
      className="nodeNote"
      // Стикер стоит поверх холста: без этого протяжка за него таскала бы
      // ноду, а клик по тексту начинал бы выделение рамкой
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="nodeNoteHead">
        <span className="nodeNoteTitle">Комментарий продакшена</span>
        <button
          className="nodeNoteDel"
          title="Удалить комментарий"
          onClick={onRemove}
        >×</button>
      </div>
      <textarea
        className="nodeNoteInput"
        value={note}
        autoFocus
        placeholder="Заметка для своих: что доснять, какой дубль, чей голос…"
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
