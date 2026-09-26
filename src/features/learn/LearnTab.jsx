import { useState, useEffect, lazy, Suspense } from 'react'
import { getCachedProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { useLessonNav } from '../../app/LessonNavContext.jsx'
import { localToday } from '../review/reviewDecks.js'
import LearnMainAction from './LearnMainAction.jsx'
import MemoryLadder from './MemoryLadder.jsx'
import MemoryLevelPage from './MemoryLevelPage.jsx'
import MemoryPermPage from './MemoryPermPage.jsx'
import LearnWordSheet from './LearnWordSheet.jsx'
import MemoryIntro from './MemoryIntro.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'

const ReviewScreen = lazy(() => import('../review/ReviewScreen.jsx'))

// Вкладка «Моя память» — отвечает на вопрос «что я помню?» (PROJECT.md →
// «Вкладки»). Главный экран — шапка с главным действием и лестница памяти
// (MemoryLadder): новенькие → мои → родные → постоянная память. Со ступени —
// страница всех её слов, с пятиугольника — постоянная память (page).
// Данные — useLearnData (живёт в ShellV2: по ним же точка на вкладке).
// Гость видит свою локальную память и подводку к входу. Настроек здесь нет:
// минуты в день, «Отпуск» и итоги недели — в шестерёнке профиля (MemorySettings)
export default function LearnTab({ learn, visible, isLoggedIn, onRequireAuth }) {
  const { view, error, reload } = learn
  const [review, setReview] = useState(null) // null | { focus: string[] | null }
  const [page, setPage] = useState(null)     // null | 1..3 | 'perm'
  const [sheet, setSheet] = useState(null)   // { word, perm }
  const [showPro, setShowPro] = useState(false)
  const [profile, setProfile] = useState(getCachedProfile)
  const { openRef } = useLessonNav()
  const today = localToday()

  useEffect(() => subscribeProfile(setProfile), [])
  // Вернулись на вкладку — тихо обновить (урок мог добавить слово)
  useEffect(() => { if (visible) reload() }, [visible, reload])

  const isPro = !!(profile?.has_subscription || profile?.is_admin)
  const openWord = perm => word => setSheet({ word, perm })
  const ladder = view?.ladder

  return (
    <div className="lrScreen">
      {page === 'perm' && ladder && <MemoryPermPage words={ladder.permanent} onWord={openWord(true)} onBack={() => setPage(null)} />}
      {typeof page === 'number' && ladder && (
        <MemoryLevelPage ladder={ladder} level={page} onLevel={setPage} onWord={openWord(false)} onBack={() => setPage(null)} />
      )}
      {!page && <h1 className="lrTitle">Моя память</h1>}
      {!view && !error && <p className="lrNote">Загрузка…</p>}
      {error && !view && <p className="lrNote">Не загрузилось. <button className="lrLink" onClick={reload}>Ещё раз</button></p>}
      {view && !page && (
        <>
          <MemoryLadder ladder={ladder} onOpen={setPage} onWord={openWord(false)}>
            <LearnMainAction view={view} today={today} onStart={() => setReview({ focus: null })} onChanged={reload} />
          </MemoryLadder>
          {!isLoggedIn && (
            <div className="lrGuestLead">
              <p className="lrMainSub">Войди — память слов сохранится, и завтра напомним повторить. Сейчас она живёт только в этом браузере</p>
              <button className="lrBtn lrBtnMain" onClick={onRequireAuth}>Войти</button>
            </div>
          )}
        </>
      )}
      {sheet && (
        <LearnWordSheet
          word={sheet.word}
          perm={sheet.perm}
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
      <MemoryIntro open={visible} />
    </div>
  )
}
