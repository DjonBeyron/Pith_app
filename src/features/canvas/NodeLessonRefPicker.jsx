import { useState, useEffect } from 'react'
import { listPublishedLessons } from '../../shared/lib/lessonsApi.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'

// Редактор ноды lesson_ref (канвас): чекбокс урок/модуль → дропдаун из
// ОПУБЛИКОВАННЫХ (ученику доступных) уроков либо модулей + доп. текст под
// названием в пузыре чата. targetTitle — снимок названия на момент выбора
// (для мгновенного рендера в канвасе); в плеере название перечитывается
// живым запросом — см. LessonRefModule.jsx.
export default function NodeLessonRefPicker({ value, onChange }) {
  const { isModule = false, targetId = null, targetTitle = '', caption = '' } = value ?? {}
  const [lessons, setLessons] = useState(null)
  const [modules, setModules] = useState(null)

  useEffect(() => {
    if (isModule) {
      if (modules) return
      loadCurricula().then(rows =>
        setModules(rows.filter(r => r.published && !r.preview_only)))
    } else {
      if (lessons) return
      listPublishedLessons().then(setLessons)
    }
  }, [isModule]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = isModule ? modules : lessons
  const patch = p => onChange({ isModule, targetId, targetTitle, caption, ...p })

  return (
    <div className="nodeLessonRefPicker" onClick={e => e.stopPropagation()}>
      <label className="nodeLessonRefToggle" onMouseDown={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isModule}
          onChange={e => patch({ isModule: e.target.checked, targetId: null, targetTitle: '' })}
        />
        Ссылка на модуль (а не на урок)
      </label>
      <select
        className="nodeTextInput"
        value={targetId ?? ''}
        onChange={e => {
          const id = e.target.value || null
          const title = options?.find(o => o.id === id)?.title ?? ''
          patch({ targetId: id, targetTitle: title })
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <option value="">— выбери {isModule ? 'модуль' : 'урок'} —</option>
        {(options ?? []).map(o => (
          <option key={o.id} value={o.id}>{o.title}</option>
        ))}
      </select>
      <input
        className="nodeTextInput"
        value={caption}
        onChange={e => patch({ caption: e.target.value })}
        placeholder="Подпись под названием (необязательно): «Изучить урок»..."
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      />
    </div>
  )
}
