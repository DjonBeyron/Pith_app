import { useState, useEffect, lazy, Suspense } from 'react'
import { getCachedProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { useLessonNav } from '../../app/LessonNavContext.jsx'
import { localToday } from '../review/reviewDecks.js'
import { onLearnHome } from '../../shared/lib/learnHomeEvent.js'
import { listWordAudio } from '../../shared/lib/wordAudio/wordAudioApi.js'
import { debugStepWord } from '../../shared/api/memoryApi.js'
import { findLadderWord } from './memoryLadder.js'
import LearnMainAction from './LearnMainAction.jsx'
import MemoryLadder from './MemoryLadder.jsx'
import LearnPattern from './LearnPattern.jsx'
import MemoryLevelPage from './MemoryLevelPage.jsx'
import MemoryPhrases from './MemoryPhrases.jsx'
import MemoryPhrasesSheet from './MemoryPhrasesSheet.jsx'
import MemoryPhraseCard from './MemoryPhraseCard.jsx'
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
  const [phrases, setPhrases] = useState(null) // null | 'all' (окно «Все фразы») | фраза из view.phraseList (её карточка)
  const [showPro, setShowPro] = useState(false)
  const [stepBusy, setStepBusy] = useState(false)
  const [profile, setProfile] = useState(getCachedProfile)
  const { openRef } = useLessonNav()
  const today = localToday()

  useEffect(() => subscribeProfile(setProfile), [])
  // Библиотека озвучки слов — заранее (кэш на сессию): значки ▶ в списке «Все слова» готовы сразу
  useEffect(() => { listWordAudio() }, [])
  // Тап по значку «Память» в нижней панели, когда вкладка уже открыта — из
  // списка слов назад на главный экран
  useEffect(() => onLearnHome(() => setPage(null)), [])
  // Вернулись на вкладку — тихо обновить (урок мог добавить слово)
  useEffect(() => { if (visible) reload() }, [visible, reload])

  const isPro = !!(profile?.has_subscription || profile?.is_admin)
  const isAdmin = !!profile?.is_admin
  const openWord = (word, perm = false) => setSheet({ word, perm })
  const ladder = view?.ladder
  // Окно слова показывает свежие данные: после тест-шага админа слово могло перейти на другую ступень
  const live = sheet && ladder ? findLadderWord(ladder, sheet.word.word) : null
  const sheetWord = live ? { ...sheet.word, ...live.word } : sheet?.word
  const sheetPerm = live ? live.perm : sheet?.perm
  // Тест админа: «Повторил → следующий уровень» / «Сбросить слово» (memory_debug_step)
  async function stepWord(action) {
    setStepBusy(true)
    const r = await debugStepWord(sheet.word.word, action)
    if (r?.ok) await reload()
    setStepBusy(false)
  }

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
            <MemoryPhrases list={view.phraseList} today={today} onOpen={setPhrases} onAll={() => setPhrases('all')} />
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
            word={sheetWord}
            perm={sheetPerm}
            isPro={isPro}
            isAdmin={isAdmin}
            stepBusy={stepBusy}
            onStep={stepWord}
            onLesson={() => { setSheet(null); openRef({ isModule: false, targetId: sheetWord.lessonId }, null) }}
            onReview={() => { setSheet(null); setReview({ focus: [sheetWord.word] }) }}
            onWantPro={() => { setSheet(null); setShowPro(true) }}
            onClose={() => setSheet(null)}
          />
        )}
        {phrases === 'all' && (
          <MemoryPhrasesSheet list={view.phraseList} today={today} onOpen={setPhrases} onClose={() => setPhrases(null)} />
        )}
        {phrases && phrases !== 'all' && (
          <MemoryPhraseCard p={phrases} today={today} onClose={() => setPhrases(null)}
            onWord={w => { setPhrases(null); openWord(w) }}
            onOpenModule={() => { const id = phrases.id, title = phrases.title; setPhrases(null); openRef({ isModule: true, targetId: id, targetTitle: title }, null) }} />
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
