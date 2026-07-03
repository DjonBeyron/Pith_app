// Дропдаун «→ Урок»: привязывает ответ интерактивной ноды к уроку-цели,
// которому уйдут данные для анализа знаний (SKILL_ANALYSIS.md §3).
// Пишет id урока модуля (statLessonId) или null.
export default function NodeLessonLink({
  value, onChange, moduleLessons = [],
  label = '→ Урок', emptyLabel = '— не привязан —',
}) {
  return (
    <div className="nodeStatLinkRow" onClick={e => e.stopPropagation()}>
      <span className="nodeStatLinkLabel">{label}</span>
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
