import { autoGrowTextarea } from '../../../shared/lib/autoGrowTextarea.js'

// Комментарий продакшена в панели правки рядом с плеером — тот же node.note,
// что жёлтым стикером висит у ноды на холсте (NodeNoteBox.jsx). На холсте он
// был виден всегда, а при правке прямо из плеера — нет: заметку «доснять
// кадр», «переписать дубль» приходилось искать, возвращаясь в канвас.
//
// Ученик этого поля не видит никогда: плеер node.note не читает.
export default function PlayerNoteField({ note, onChange }) {
  const has = note != null

  return (
    <div className="playerEditNote">
      <div className="playerEditNoteHead">
        <span>Комментарий продакшена</span>
        {has && (
          <button
            className="playerEditNoteBtn"
            title="Удалить комментарий"
            onClick={() => onChange({ note: null })}
          >×</button>
        )}
      </div>
      {has ? (
        <textarea
          className="playerEditNoteArea"
          value={note}
          rows={2}
          placeholder="Что доснять, чей голос, какой дубль взять..."
          onChange={e => { onChange({ note: e.target.value }); autoGrowTextarea(e.target) }}
          ref={el => { if (el) autoGrowTextarea(el) }}
        />
      ) : (
        <button className="playerEditNoteAdd" onClick={() => onChange({ note: '' })}>
          + добавить заметку к этому сообщению
        </button>
      )}
    </div>
  )
}
