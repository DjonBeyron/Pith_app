// Попап после диагностики: объясняет новичку, что произошло, показывает
// мини-схему ЕГО уроков с полученными приоритетами и легенду цветов.
// Пока открыт — граф спрятан, его анимации на паузе (animHold в ModuleGraph).
// Закрывается только вручную: ✕, кнопка «Понятно» или тап по затемнению.

const LEGEND = [
  { key: 'high',   title: 'Высокий', desc: 'Наиболее важные для вас уроки' },
  { key: 'medium', title: 'Средний', desc: 'Полезные уроки для развития' },
  { key: 'low',    title: 'Низкий',  desc: 'Можно изучить позже' },
]

const STATUS_LABEL = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }

export default function PriorityLegend({ lessons = [], priorities = null, moduleTitle = '', onClose }) {
  // Мини-схема: только уроки, получившие приоритет (без Старта/Финала и без пустых)
  const miniItems = lessons.slice(1, -1)
    .map(l => ({ id: l.id, title: l.title, priority: priorities?.get(l.id) ?? null }))
    .filter(it => it.priority)

  return (
    <div className="priorityLegendOverlay" onClick={onClose}>
      <div className="priorityLegendCard" onClick={e => e.stopPropagation()}>
        <button className="priorityLegendClose" onClick={onClose}>✕</button>
        <h3 className="priorityLegendTitle">Диагностика пройдена! 🎉</h3>
        <p className="priorityLegendIntro">
          Мы составили для тебя персональную карту обучения
          {moduleTitle ? <> по фразе «<b>{moduleTitle}</b>»</> : null}.
          Каждый урок получил персональный приоритет:
        </p>

        {miniItems.length > 0 && (
          <div className="plMiniList">
            {miniItems.map(it => (
              <div key={it.id} className={`plMiniCard plMiniCard--${it.priority}`}>
                <span className={`plMiniDot plMiniDot--${it.priority}`}>●</span>
                <span className="plMiniTitle">{it.title}</span>
                <span className={`plMiniStatus plMiniStatus--${it.priority}`}>
                  {STATUS_LABEL[it.priority]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="priorityLegendRows">
          {LEGEND.map(it => (
            <div key={it.key} className={`priorityLegendRow priorityLegendRow--${it.key}`}>
              <span className="priorityLegendIcon">●</span>
              <div className="priorityLegendText">
                <span className="priorityLegendLabel">{it.title}</span>
                <span className="priorityLegendDesc">{it.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <button className="priorityLegendOkBtn" onClick={onClose}>Понятно</button>
      </div>
    </div>
  )
}
