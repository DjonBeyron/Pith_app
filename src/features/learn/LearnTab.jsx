import { useState, useEffect, lazy, Suspense } from 'react'
import { plural } from '../../shared/lib/plural.js'
import { getCachedProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { useLessonNav } from '../../app/LessonNavContext.jsx'
import { localToday } from '../review/reviewDecks.js'
import LearnMainAction from './LearnMainAction.jsx'
import LearnMemoryMap from './LearnMemoryMap.jsx'
import LearnWordSheet from './LearnWordSheet.jsx'
import LearnVacation from './LearnVacation.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'

const ReviewScreen = lazy(() => import('../review/ReviewScreen.jsx'))

// Вкладка «Моё обучение» — отвечает на вопрос «что я помню?» (PROJECT.md →
// «Вкладки»): не больше трёх блоков — главное действие по состоянию, строка
// итогов недели, карта памяти. Данные — useLearnData (живёт в ShellV2: по
// ним же точка на вкладке). Гостю — приглашение войти.
function weekLine({ days, words, grew }) {
  if (!days) return 'На этой неделе повторений ещё не было'
  return `За 7 дней: ${days} ${plural(days, 'день', 'дня', 'дней')} с повторением · ${words} ${plural(words, 'слово', 'слова', 'слов')}`
    + (grew ? ` · окрепло ${grew}` : '')
}

export default function LearnTab({ learn, visible, isLoggedIn, onRequireAuth }) {
  const { view, error, reload } = learn
  const [review, setReview] = useState(null) // null | { focus: string[] | null }
  const [sheet, setSheet] = useState(null)   // { word, phrase }
  const [showPro, setShowPro] = useState(false)
  const [profile, setProfile] = useState(getCachedProfile)
  const { openRef } = useLessonNav()
  const today = localToday()

  useEffect(() => subscribeProfile(setProfile), [])
  // Вернулись на вкладку — тихо обновить (урок мог добавить слово)
  useEffect(() => { if (visible && isLoggedIn) reload() }, [visible, isLoggedIn, reload])

  if (!isLoggedIn) {
    return (
      <div className="lrScreen">
        <h1 className="lrTitle">Моё обучение</h1>
        <div className="lrMain">
          <p className="lrMainTitle">Здесь живёт твоя память слов</p>
          <p className="lrMainSub">Войди — и пройденные слова будут возвращаться на повторение ровно тогда, когда начинают забываться</p>
        </div>
        <button className="lrBtn lrBtnMain" onClick={onRequireAuth}>Войти</button>
      </div>
    )
  }

  const isPro = !!(profile?.has_subscription || profile?.is_admin)
  return (
    <div className="lrScreen">
      <h1 className="lrTitle">Моё обучение</h1>
      {!view && !error && <p className="lrNote">Загрузка…</p>}
      {error && !view && <p className="lrNote">Не загрузилось. <button className="lrLink" onClick={reload}>Ещё раз</button></p>}
      {view && (
        <>
          <LearnMainAction view={view} today={today} onStart={() => setReview({ focus: null })} onChanged={reload} />
          {!view.empty && <p className="lrWeek">{weekLine(view.week)}</p>}
          <LearnMemoryMap phrases={view.phrases} onWord={(word, phrase) => setSheet({ word, phrase })} />
          {!view.empty && !view.vacation && <LearnVacation onChanged={reload} />}
        </>
      )}
      {sheet && (
        <LearnWordSheet
          word={sheet.word}
          phrase={sheet.phrase}
          today={today}
          isPro={isPro}
          onLesson={() => { setSheet(null); openRef({ isModule: false, targetId: sheet.word.lessonId }, null) }}
          onReview={() => { setSheet(null); setReview({ focus: [sheet.word.word] }) }}
          onWantPro={() => { setSheet(null); setShowPro(true) }}
          onClose={() => setSheet(null)}
        />
      )}
      {review && (
        <Suspense fallback={null}>
          <ReviewScreen focusWords={review.focus} onClose={() => { setReview(null); reload() }} />
        </Suspense>
      )}
      {showPro && <ProPaywall onClose={() => setShowPro(false)} />}
    </div>
  )
}
