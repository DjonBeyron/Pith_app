import { useLessons } from './useLessons.js'

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function LessonsTab({ onOpenCanvas }) {
  const { lessons, loading, creating, error, create, remove } = useLessons({ onOpenCanvas })

  return (
    <div className="lessonsPanel">
      <div className="toolbar">
        <button className="primaryBtn" onClick={create} disabled={creating}>
          {creating ? 'Создание...' : '+ Создать урок'}
        </button>
      </div>

      {error && <div className="errorText">{error}</div>}

      {loading ? (
        <div className="lessonsHint">Загрузка...</div>
      ) : lessons.length === 0 ? (
        <div className="lessonsHint">Уроков пока нет. Нажми «Создать урок».</div>
      ) : (
        <div className="lessonsList">
          {lessons.map(l => (
            <div className="lessonRow" key={l.id}>
              <div className="lessonRowMain" onClick={() => onOpenCanvas(l.id)}>
                <span className="lessonTitle">{l.title}</span>
                <span className="lessonDate">{formatDate(l.created_at)}</span>
              </div>
              <button
                className="lessonDeleteBtn"
                onClick={e => { e.stopPropagation(); remove(l.id) }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
