import { useState } from 'react'
import { plural } from '../../shared/lib/plural.js'
import { setVacation } from '../../shared/api/memoryApi.js'
import { dueLabel } from './learnView.js'

// Шапка «Моей памяти» — главное действие по состоянию, одно:
// «Отпуск» (+ вернуться) | память пуста | «Сегодня повторяем N слов» +
// «Повторить» | «Закрепить фразу» | «На сегодня всё ✓» (+ когда следующее).
// От низа шапки идёт ствол линий к ступеням (MemoryLadderWires.jsx)
const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
const words = n => `${n} ${plural(n, 'слово', 'слова', 'слов')}`

function Hero({ mod = '', title, sub, children }) {
  return (
    <div className={'lrMain' + mod}>
      <p className="lrMainTitle">{title}</p>
      {sub && <p className="lrMainSub">{sub}</p>}
      {children}
    </div>
  )
}

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
      <Hero mod=" lrMainVacation" title="Ты в отпуске 🌴"
        sub={`Повторения на паузе с ${fmtDate(view.vacation.since)}. Вернёшься — сроки сдвинутся, долга не будет`}>
        <button className="lrBtn lrBtnMain" disabled={busy} onClick={back}>Вернуться из отпуска</button>
      </Hero>
    )
  }
  if (view.empty) {
    return <Hero title="Память пока пуста" sub="Пройди урок-слово в любой фразе — завтра повторим его здесь" />
  }
  const { picked, phrase } = view.today
  if (picked.length) {
    return (
      <Hero title={`Сегодня повторяем ${words(picked.length)}`} sub="чтобы они ушли в долгую память">
        <button className="lrCta" onClick={onStart}>
          Повторить<span className="lrCtaCount">{words(picked.length)}</span>
        </button>
      </Hero>
    )
  }
  if (phrase) {
    return (
      <Hero mod=" lrMainPhrase" title="Сегодня закрепляем фразу" sub={`Все слова «${phrase.title}» окрепли — собери её целиком`}>
        <button className="lrCta" onClick={onStart}>Закрепить фразу</button>
      </Hero>
    )
  }
  return (
    <Hero mod=" lrMainDone" title="На сегодня всё ✓"
      sub={view.next
        ? `Следующее повторение ${dueLabel(view.next.date, today)} · ${words(view.next.count)}`
        : 'Новые слова появятся после следующих уроков'} />
  )
}
