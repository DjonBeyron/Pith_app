import { plural } from '../../shared/lib/plural.js'
import { dueLabel } from './learnView.js'

// Главное действие вкладки «Моё обучение» — по состоянию, одно:
// «Повторить · 2 мин» | «На сегодня всё ✓» (+ когда следующее) | память пуста
export default function LearnMainAction({ view, today, onStart }) {
  if (view.empty) {
    return (
      <div className="lrMain">
        <p className="lrMainTitle">Память пока пуста</p>
        <p className="lrMainSub">Пройди урок-слово в любой фразе — завтра повторим его здесь</p>
      </div>
    )
  }
  const { picked, minutes } = view.today
  if (picked.length) {
    return (
      <button className="lrMain lrMainGo" onClick={onStart}>
        <span className="lrMainTitle">Повторить · {minutes} мин</span>
        <span className="lrMainSub">
          {picked.length} {plural(picked.length, 'слово ждёт', 'слова ждут', 'слов ждут')} — и день серии засчитан
        </span>
      </button>
    )
  }
  return (
    <div className="lrMain lrMainDone">
      <p className="lrMainTitle">На сегодня всё ✓</p>
      <p className="lrMainSub">
        {view.next
          ? `Следующее повторение ${dueLabel(view.next.date, today)} · ${view.next.count} ${plural(view.next.count, 'слово', 'слова', 'слов')}`
          : 'Новые слова появятся после следующих уроков'}
      </p>
    </div>
  )
}
