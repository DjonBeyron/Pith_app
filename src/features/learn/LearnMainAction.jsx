import { useState } from 'react'
import { Brain } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'
import { setVacation } from '../../shared/api/memoryApi.js'
import SleepingBrain from './SleepingBrain.jsx'

// Шапка «Моей памяти» — главное действие по состоянию, одно:
// «Отпуск» (+ вернуться) | память пуста | «Сегодня повторяем N слов» +
// «Повторить» | «Закрепить фразу» | «Памяти пора отдыхать» (всё на сегодня повторено: спящий мозг с «Z»).
// От низа шапки идёт ствол линий к ступеням (MemoryLadderWires.jsx)
const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
const words = n => `${n} ${plural(n, 'слово', 'слова', 'слов')}`

// Кнопка-призыв: сама кнопка + три обводки вокруг (вспыхивают по очереди,
// стили — learn.css; обёртка нужна, потому что у кнопки overflow: hidden)
function Cta({ onClick, children }) {
  return (
    <span className="lrCtaWrap">
      <button className="lrCta" onClick={onClick}>{children}</button>
      <i className="lrCtaRing lrCtaRing--1" aria-hidden="true" />
      <i className="lrCtaRing lrCtaRing--2" aria-hidden="true" />
      <i className="lrCtaRing lrCtaRing--3" aria-hidden="true" />
    </span>
  )
}

// flash — заголовок «моргает» зелёным как неоновая вывеска с коротким замыканием (режим сна): копия текста в
// ::after через data-text (learn-sleep.css), для скринридера текст один
function Hero({ mod = '', title, sub, flash = false, children }) {
  return (
    <div className={'lrMain' + mod}>
      <p className="lrMainTitle" data-text={flash ? title : undefined}>{title}</p>
      {sub && <p className="lrMainSub">{sub}</p>}
      {children}
    </div>
  )
}

export default function LearnMainAction({ view, onStart, onChanged }) {
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
        <Cta onClick={onStart}><Brain className="lrCtaIcon" size={16} aria-hidden="true" />Повторить<span className="lrCtaCount">{words(picked.length)}</span></Cta>
      </Hero>
    )
  }
  if (phrase) {
    return (
      <Hero mod=" lrMainPhrase" title="Сегодня закрепляем фразу" sub={`Ты уверенно вспоминаешь все слова «${phrase.title}» — собери её целиком`}>
        <Cta onClick={onStart}>Закрепить фразу</Cta>
      </Hero>
    )
  }
  return (
    <Hero mod=" lrMainDone" flash title="Памяти пора отдыхать" sub="Сегодня все слова записаны в твою память">
      <SleepingBrain />
    </Hero>
  )
}
