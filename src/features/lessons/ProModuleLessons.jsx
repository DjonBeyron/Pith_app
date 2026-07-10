import { useState } from 'react'

// Список уроков про-модуля (супер-урок гонки): без Старта/Финала и без
// графа — просто нумерованные строки. ▶ запуск · ✎ канвас · ✕ удалить,
// тап по названию — переименование. Только для админа (про-модуль скрыт).
export default function ProModuleLessons({
  lessons, completedIds, onPlay, onEdit, onDelete, onRename, onAdd, creating,
}) {
  const [renaming, setRenaming] = useState(null) // id урока
  const [draft,    setDraft]    = useState('')

  function commit() {
    if (renaming && draft.trim()) onRename(renaming, draft.trim())
    setRenaming(null)
  }

  return (
    <div className="prList">
      <div className="prHint">
        Про-модуль: только уроки, без Старта и Финала. Пользователи его не видят —
        он доступен лишь как супер-урок выбранной гонки. XP уроков начислится
        участникам после подведения итогов.
      </div>

      {lessons.map((l, i) => (
        <div key={l.id} className="prRow">
          <span className={completedIds.has(l.id) ? 'prNum prNumDone' : 'prNum'}>
            {completedIds.has(l.id) ? '✓' : i + 1}
          </span>
          {renaming === l.id ? (
            <input
              className="prRename" autoFocus value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setRenaming(null) }}
            />
          ) : (
            <button className="prTitle" onClick={() => { setRenaming(l.id); setDraft(l.title) }}>
              {l.title}
            </button>
          )}
          <span className="prXp">{l.lessonXp ?? 0} XP</span>
          <button className="prBtn" onClick={() => onPlay(l.id)} title="Запустить урок">▶</button>
          <button className="prBtn" onClick={() => onEdit(l.id)} title="Редактировать сценарий">✎</button>
          <button className="prBtn amDel" onClick={() => onDelete(l.id)} title="Удалить урок">✕</button>
        </div>
      ))}

      <button className="prAdd" onClick={() => onAdd()} disabled={creating}>
        {creating ? '...' : '+ Урок'}
      </button>
    </div>
  )
}
