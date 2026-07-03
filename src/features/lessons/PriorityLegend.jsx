// Попап после диагностики: объясняет новичку, что произошло, показывает
// мини-схему ЕГО уроков с полученными приоритетами и легенду цветов.
// Поверх затемнённой схемы; пока открыт — анимации графа на паузе (animHold).
// Закрывается только вручную: ✕ или тап по затемнению.

const LEGEND = [
  { key: 'high',   icon: '📈', title: 'Высокий', desc: 'Наиболее важные для вас уроки' },
  { key: 'medium', icon: '≡',  title: 'Средний', desc: 'Полезные уроки для развития' },
  { key: 'low',    icon: '↓',  title: 'Низкий',  desc: 'Можно изучить позже' },
]

const STATUS_LABEL = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }

export default function PriorityLegend({ lessons = [], priorities = null, onClose }) {
  // Мини-схема: обычные уроки модуля (без Старта и Финала), максимум 5
  const miniItems = lessons.slice(1, -1).slice(0, 5).map(l => ({
    id: l.id,
    title: l.title,
    priority: priorities?.get(l.id) ?? null,
  }))

  return (
    <div className="priorityLegendOverlay" onClick={onClose}>
      <div className="priorityLegendCard" onClick={e => e.stopPropagation()}>
        <button className="priorityLegendClose" onClick={onClose}>✕</button>
        <h3 className="priorityLegendTitle">Диагностика пройдена! 🎉</h3>
        <p className="priorityLegendIntro">
          Мы разобрали твои ответы: где ты отвечал уверенно, а где были ошибки.
          Каждый урок получил персональный приоритет — вот твоя карта:
        </p>

        {miniItems.length > 0 && (
          <div className="plMiniList">
            {miniItems.map(it => (
              <div key={it.id} className={`plMiniCard${it.priority ? ` plMiniCard--${it.priority}` : ''}`}>
                <span className="plMiniTitle">{it.title}</span>
                <span className={`plMiniStatus${it.priority ? ` plMiniStatus--${it.priority}` : ''}`}>
                  {it.priority ? STATUS_LABEL[it.priority] : 'нет данных'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="priorityLegendRows">
          {LEGEND.map(it => (
            <div key={it.key} className={`priorityLegendRow priorityLegendRow--${it.key}`}>
              <span className="priorityLegendIcon">{it.icon}</span>
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
