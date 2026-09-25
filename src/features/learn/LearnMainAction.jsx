import { useState } from 'react'
import { plural } from '../../shared/lib/plural.js'
import { setVacation } from '../../shared/api/memoryApi.js'
import { dueLabel } from './learnView.js'

// Главное действие вкладки «Моё обучение» — по состоянию, одно:
// «Отпуск» (+ вернуться) | память пуста | «Повторить · 2 мин» |
// «На сегодня всё ✓» (+ когда следующее)
const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' })

export default function LearnMainAction({ view, today, onStart, onChanged }) {
  const [busy, setBusy] = useState(false)

  if (view.vacation) {
    async function back() {
      setBusy(true)
      const res = await setVacation(false)
      setBusy(false)
      if (res?.ok) onChanged()
    }
    return (
      <div className="lrMain lrMainVacation">
        <p className="lrMainTitle">Ты в отпуске 🌴</p>
        <p className="lrMainSub">Повторения на паузе с {fmtDate(view.vacation.since)}. Вернёшься — сроки сдвинутся, долга не будет</p>
        <button className="lrBtn lrBtnMain" disabled={busy} onClick={back}>Вернуться из отпуска</button>
      </div>
    )
  }
  if (view.empty) {
    return (
      <div className="lrMain">
        <p className="lrMainTitle">Память пока пуста</p>
        <p className="lrMainSub">Пройди урок-слово в любой фразе — завтра повторим его здесь</p>
      </div>
    )
  }
  const { picked, minutes, phrase } = view.today
  if (!picked.length && phrase) {
    return (
      <button className="lrMain lrMainGo lrMainPhrase" onClick={onStart}>
        <span className="lrMainTitle">Закрепить фразу · {minutes} мин</span>
        <span className="lrMainSub">Все слова «{phrase.title}» окрепли — собери её целиком</span>
      </button>
    )
  }
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
