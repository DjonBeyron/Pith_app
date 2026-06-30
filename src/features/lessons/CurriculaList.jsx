import { useState } from 'react'

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CurriculaList({ curricula, syncStatus, syncError, onCreate, onOpen, onDelete, onRename, onSave }) {
  const [savingId, setSavingId] = useState(null)
  const [msgs,     setMsgs]    = useState({})

  function handleRename(e, id, currentTitle) {
    e.stopPropagation()
    const title = window.prompt('Название модуля:', currentTitle)
    if (title && title.trim() && title.trim() !== currentTitle) {
      onRename(id, title.trim())
    }
  }

  async function handleSave(e, c) {
    e.stopPropagation()
    setSavingId(c.id)
    const result = await onSave(c.id, c.title)
    setSavingId(null)
    setMsgs(prev => ({ ...prev, [c.id]: result.ok ? '✓' : '✗' }))
    setTimeout(() => setMsgs(prev => { const n = { ...prev }; delete n[c.id]; return n }), 2500)
  }

  const syncLabel = syncStatus === 'loading' ? '⟳ Загрузка с сервера...'
    : syncStatus === 'error'   ? `⚠ Ошибка загрузки: ${syncError}`
    : null

  return (
    <div className="lessonsPanel">
      <div className="toolbar">
        <button className="primaryBtn" onClick={onCreate}>+ Создать модуль</button>
      </div>

      {syncLabel && (
        <div className={`syncStatusBar syncStatusBar--${syncStatus}`}>{syncLabel}</div>
      )}

      {syncStatus !== 'loading' && curricula.length === 0 ? (
        <div className="lessonsHint">Модулей пока нет. Нажми «Создать модуль».</div>
      ) : (
        <div className="lessonsList">
          {curricula.map(c => (
            <div className="lessonRow" key={c.id}>
              <div className="lessonRowMain" onClick={() => onOpen(c)}>
                <span className="lessonTitle">{c.title}</span>
                <span className="lessonDate">{formatDate(c.createdAt)}</span>
              </div>
              {msgs[c.id] && <span className="dbSaveMsg">{msgs[c.id]}</span>}
              <button className="saveBtn" title="Сохранить на сервер"
                onClick={e => handleSave(e, c)} disabled={savingId === c.id}>
                {savingId === c.id ? '...' : '💾'}
              </button>
              <button className="lessonRenameBtn"
                onClick={e => handleRename(e, c.id, c.title)}
                title="Переименовать">✎</button>
              <button className="lessonDeleteBtn"
                onClick={e => { e.stopPropagation(); onDelete(c.id) }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
