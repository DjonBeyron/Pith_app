import { useState, useEffect, lazy, Suspense } from 'react'
import { getCachedProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { useLessonNav } from '../../app/LessonNavContext.jsx'
import { localToday } from '../review/reviewDecks.js'
import { onLearnHome } from '../../shared/lib/learnHomeEvent.js'
import LearnMainAction from './LearnMainAction.jsx'
import MemoryLadder from './MemoryLadder.jsx'
import LearnPattern from './LearnPattern.jsx'
import MemoryLevelPage from './MemoryLevelPage.jsx'
import LearnWordSheet from './LearnWordSheet.jsx'
import MemoryIntro from './MemoryIntro.jsx'
import ProPaywall from '../pro/ProPaywall.jsx'

const ReviewScreen = lazy(() => import('../review/ReviewScreen.jsx'))

// Вкладка «Моя память» — отвечает на вопрос «что я помню?» (PROJECT.md →
// «Вкладки»). Главный экран — шапка с главным действием и лестница памяти
// (MemoryLadder): новые → знакомые → усвоенные → постоянная память. Со ступени
// и с пятиугольника — страница уровней с четырьмя вкладками (page = 1..4).
// Данные — useLearnData (живёт в ShellV2: по ним же точка на вкладке).
// Гость видит свою локальную память и подводку к входу. Настроек здесь нет:
// минуты в день, «Отпуск» и итоги недели — в шестерёнке профиля (MemorySettings)
export default function LearnTab({ learn, visible, isLoggedIn, onRequireAuth }) {
  const { view, error, reload } = learn
  const [review, setReview] = useState(null) // null | { focus: string[] | null }
  const [page, setPage] = useState(null)     // null (главный экран) | 1..4 (страница уровней; 4 — постоянная память)
  const [sheet, setSheet] = useState(null)   // { word, perm }
  const [showPro, setShowPro] = useState(false)
  const [profile, setProfile] = useState(getCachedProfile)
  const { openRef } = useLessonNav()
  const today = localToday()

  useEffect(() => subscribeProfile(setProfile), [])
  // Тап по значку «Память» в нижней панели, когда вкладка уже открыта — из
  // списка слов назад на главный экран
  useEffect(() => onLearnHome(() => setPage(null)), [])
  // Вернулись на вкладку — тихо обновить (урок мог добавить слово)
  useEffect(() => { if (visible) reload() }, [visible, reload])

  const isPro = !!(profile?.has_subscription || profile?.is_admin)
  const openWord = (word, perm = false) => setSheet({ word, perm })
  const ladder = view?.ladder

  return (
    <div className="lrRoot">
      <LearnPattern view={view} ladder={ladder} />
      <div className="lrScreen">
        {page && ladder && (
          <MemoryLevelPage ladder={ladder} level={page} onLevel={setPage} onWord={openWord} onBack={() => setPage(null)} />
        )}
        {!page && <h1 className="lrTitle">Моя память</h1>}
        {!view && !error && <p className="lrNote">Загрузка…</p>}
        {error && !view && <p className="lrNote">Не загрузилось. <button className="lrLink" onClick={reload}>Ещё раз</button></p>}
        {view && !page && (
          <>
            <MemoryLadder ladder={ladder} onOpen={setPage} onWord={openWord}>
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
      {/* Затемнение снизу — как у схемы модуля (moduleGraphEdge--bottom): то, что
          уходит под нижнюю панель, плавно темнеет, а не режется ровной линией */}
      <div className="lrEdgeBottom" aria-hidden="true" />
    </div>
  )
}
