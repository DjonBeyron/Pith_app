import { useState, useEffect, lazy, Suspense } from 'react'
import { plural } from '../../shared/lib/plural.js'
import { getCachedProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { useLessonNav } from '../../app/LessonNavContext.jsx'
import { localToday } from '../review/reviewDecks.js'
import LearnMainAction from './LearnMainAction.jsx'
import LearnMemoryMap from './LearnMemoryMap.jsx'
import LearnWordSheet from './LearnWordSheet.jsx'
import LearnVacation from './LearnVacation.jsx'
import MinutesSheet from './MinutesSheet.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'

const ReviewScreen = lazy(() => import('../review/ReviewScreen.jsx'))

// Вкладка «Моё обучение» — отвечает на вопрос «что я помню?» (PROJECT.md →
// «Вкладки»): не больше трёх блоков — главное действие по состоянию, строка
// итогов недели, карта памяти. Данные — useLearnData (живёт в ShellV2: по
// ним же точка на вкладке). Гость видит свою локальную память и подводку к
// входу («сохрани прогресс, чтобы завтра напомнили»); «Отпуск» — только в аккаунте.
// Итоги недели — только в плюс: сравнение с прошлой неделей показываем,
// когда окрепло больше (меньше — не упрекаем)
function weekLine({ days, words, grew, prevGrew }) {
  if (!days) return 'На этой неделе повторений ещё не было'
  return `За 7 дней: ${days} ${plural(days, 'день', 'дня', 'дней')} с повторением · ${words} ${plural(words, 'слово', 'слова', 'слов')}`
    + (grew ? ` · окрепло ${grew}` : '')
    + (grew && prevGrew != null && grew > prevGrew ? ' — больше, чем неделей раньше' : '')
}

export default function LearnTab({ learn, visible, isLoggedIn, onRequireAuth }) {
  const { view, error, reload } = learn
  const [review, setReview] = useState(null) // null | { focus: string[] | null }
  const [sheet, setSheet] = useState(null)   // { word, phrase }
  const [showPro, setShowPro] = useState(false)
  const [minutesOpen, setMinutesOpen] = useState(false)
  const [profile, setProfile] = useState(getCachedProfile)
  const { openRef } = useLessonNav()
  const today = localToday()

  useEffect(() => subscribeProfile(setProfile), [])
  // Вернулись на вкладку — тихо обновить (урок мог добавить слово)
  useEffect(() => { if (visible) reload() }, [visible, reload])

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
          {!isLoggedIn && (
            <div className="lrGuestLead">
              <p className="lrMainSub">Войди — память слов сохранится, и завтра напомним повторить. Сейчас она живёт только в этом браузере</p>
              <button className="lrBtn lrBtnMain" onClick={onRequireAuth}>Войти</button>
            </div>
          )}
          {!view.empty && (
            <button className="lrVacationLink" onClick={() => setMinutesOpen(true)}>
              Повторение: {view.minutes} минут в день · изменить
            </button>
          )}
          {isLoggedIn && !view.empty && !view.vacation && <LearnVacation onChanged={reload} />}
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
          <ReviewScreen focusWords={review.focus} phrase={review.focus ? null : view?.today.phrase}
            onClose={() => { setReview(null); reload() }}
            onRequireAuth={() => { setReview(null); onRequireAuth() }} />
        </Suspense>
      )}
      {showPro && <ProPaywall onClose={() => setShowPro(false)} />}
      {minutesOpen && (
        <MinutesSheet current={view?.minutes} isGuest={!isLoggedIn}
          onClose={changed => { setMinutesOpen(false); if (changed) reload() }} />
      )}
    </div>
  )
}
