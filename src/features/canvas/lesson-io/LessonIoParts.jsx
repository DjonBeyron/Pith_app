import { PARTS } from './lessonParts.js'

// Ряд галочек «какие части файла»: урок (скрипт) / карточки повтора / справка слова —
// и в экспорте (что выгрузить), и в импорте (что применить из файла). info[id] — подпись
// справа от названия; absent[id] — части нет (галочка недоступна)
export default function LessonIoParts({ title, value, onChange, info = {}, absent = {} }) {
  return (
    <fieldset className="lioParts">
      <legend>{title}</legend>
      {PARTS.map(p => (
        <label key={p.id} className={'lioPart' + (absent[p.id] ? ' lioPartOff' : '')}>
          <input
            type="checkbox"
            checked={!!value[p.id] && !absent[p.id]}
            disabled={!!absent[p.id]}
            onChange={e => onChange({ ...value, [p.id]: e.target.checked })}
          />
          <span className="lioPartName">{p.label}</span>
          <span className="lioPartInfo">{absent[p.id] ? 'нет в файле' : info[p.id]}</span>
        </label>
      ))}
    </fieldset>
  )
}
