// Дропдаун «Урок для анализа»: привязывает ответ интерактивной ноды к уроку,
// которому уйдут данные для анализа знаний (SKILL_ANALYSIS.md §3).
// Пишет id урока модуля (statLessonId) или null.

const HELP_TEXT =
  'Ответ пользователя уйдёт в копилку выбранного урока: верно/неверно, ' +
  'с какой попытки, сколько думал. По этим данным урок получит полоску ' +
  'приоритета на схеме модуля (Высокий / Средний / Низкий). ' +
  'Без привязки ответ в анализ не попадает.'

export default function NodeLessonLink({
  value, onChange, moduleLessons = [],
  label = 'Урок для анализа', emptyLabel = '— не привязан —',
}) {
  return (
    <div className="nodeStatLinkRow" onClick={e => e.stopPropagation()}>
      <span className="nodeStatLinkLabel">{label}</span>
      <span className="nodeStatLinkHelp" data-tip={HELP_TEXT}>?</span>
      <select
        className={`nodeStatLinkSelect${value ? ' nodeStatLinkSelectOn' : ''}`}
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        onMouseDown={e => e.stopPropagation()}
      >
        <option value="">{emptyLabel}</option>
        {moduleLessons.map(l => (
          <option key={l.id} value={l.id}>{l.title}</option>
        ))}
      </select>
    </div>
  )
}
