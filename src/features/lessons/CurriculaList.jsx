function formatDate(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CurriculaList({ curricula, onCreate, onOpen, onDelete, onRename }) {
  function handleRename(e, id, currentTitle) {
    e.stopPropagation()
    const title = window.prompt('Название модуля:', currentTitle)
    if (title && title.trim() && title.trim() !== currentTitle) {
      onRename(id, title.trim())
    }
  }

  return (
    <div className="lessonsPanel">
      <div className="toolbar">
        <button className="primaryBtn" onClick={onCreate}>+ Создать модуль</button>
      </div>

      {curricula.length === 0 ? (
        <div className="lessonsHint">Модулей пока нет. Нажми «Создать модуль».</div>
      ) : (
        <div className="lessonsList">
          {curricula.map(c => (
            <div className="lessonRow" key={c.id}>
              <div className="lessonRowMain" onClick={() => onOpen(c)}>
                <span className="lessonTitle">{c.title}</span>
                <span className="lessonDate">{formatDate(c.createdAt)}</span>
              </div>
              <button className="lessonRenameBtn"
                onClick={e => handleRename(e, c.id, c.title)}
                title="Переименовать">
                ✎
              </button>
              <button className="lessonDeleteBtn"
                onClick={e => { e.stopPropagation(); onDelete(c.id) }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
