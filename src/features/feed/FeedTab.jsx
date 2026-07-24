import { useMemo, useState } from 'react'
import { displayDifficulty } from '../../shared/api/difficultyApi.js'
import CurriculumView from '../lessons/CurriculumView.jsx'
import FeedSlide from './FeedSlide.jsx'
import MyLessons from './MyLessons.jsx'
import DebugPanel from './DebugPanel.jsx'
import FeedTabsHeader from './FeedTabsHeader.jsx'
import FeedSearchPanel from './FeedSearchPanel.jsx'
import { useAuth } from '../../shared/lib/useAuth.js'
import { useFeedSound } from './useFeedSound.js'
import { useFeedSocial } from './useFeedSocial.js'
import { useFeedModules } from './useFeedModules.js'
import { useFeedFilter } from './useFeedFilter.js'
import { useFeedSplash } from './useFeedSplash.js'
import { useFeedVirtualizer } from './useFeedVirtualizer.js'
import { buildFeedInfo } from './feedDebugInfo.js'

// Лента видео (новая оболочка, шаг 3 миграции): вертикальный scroll-snap
// по модулям из curricula, бесконечная по кругу — список повторяется
// циклами, а при подходе к краю scrollTop незаметно переносится на один
// цикл внутрь (контент идентичен — скачка не видно). Вместо видео пока
// градиент-заглушка — поле video_url появится на серверном этапе.
export default function FeedTab({ visible = true, onOpenCanvas, onRequireAuth }) {
  const [view, setView] = useState('feed') // feed | mine
  // Открытый модуль (схема Старт → уроки → Финал) поверх ленты
  const [openModule, setOpenModule] = useState(null)
  const [showDebug, setShowDebug] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  // Авторизация из локальной сессии — мгновенно, не ждём fetchFeedSocial
  // (раньше тап по лайку до его загрузки улетал в форму входа)
  const { user, loading: authLoading } = useAuth()

  const { soundOn, soundReady, soundGestureRef, handleSoundOn, handleSoundBlocked } = useFeedSound()
  const {
    reactions, diffVotes, startedIds, social, refreshStarted, toggle, voteDifficulty,
  } = useFeedSocial({ visible, view, user, authLoading, onRequireAuth })
  const { modules, error, feedModules: circleModules, len: circleLen, pinnedId, jumpTo } = useFeedModules(startedIds, visible)
  const { selected: diffSelected, toggle: toggleDiff, reset: resetDiffFilter, active: filterActive, passesFeed, passesMine } = useFeedFilter()

  // Позиция модуля в общем списке — стабильная опора для детерминированного
  // подмешивания серых фраз (~1 из 6) в useFeedFilter.passesFeed
  const overallIdx = useMemo(() => {
    const map = new Map()
    ;(modules ?? []).forEach((m, i) => map.set(m.id, i))
    return map
  }, [modules])

  // Фильтр сложности применяется ДО виртуализатора: сужает саму ленту.
  // Закреплённая фраза (deep-link/поворот из поиска) видна всегда — фильтр
  // её не прячет, как и настоящий deep-link
  const feedModules = useMemo(
    () => circleModules.filter(m => m.id === pinnedId || passesFeed(m, overallIdx.get(m.id) ?? 0)),
    [circleModules, pinnedId, passesFeed, overallIdx],
  )
  const len = feedModules.length

  useFeedSplash(modules, len, feedModules)
  const { scrollRef, virtualizer, viewH, cycles, activeIdx, onScroll, scrollDir } = useFeedVirtualizer(len, openModule, pinnedId)

  function jumpToModule(id) {
    jumpTo(id)
    setView('feed')
    setShowSearch(false)
  }

  // «Изучить фразу» → готовый экран модуля (схема, карточка прогрева, плеер)
  if (openModule) {
    return (
      <div className="feedModuleScreen">
        <CurriculumView
          curriculumId={openModule.id}
          curriculumTitle={openModule.title}
          onBack={() => { setOpenModule(null); refreshStarted() }}
          onOpenCanvas={onOpenCanvas}
        />
      </div>
    )
  }

  function feedInfo() {
    return buildFeedInfo({
      view, len, cycles, viewH, activeIdx, startedIds, modules, visible,
      scrollEl: scrollRef.current, virtualizer, soundOn, soundGestureRef,
    })
  }

  return (
    <div className="feedV2">
      <FeedTabsHeader
        view={view} onSetView={setView} onShowDebug={() => setShowDebug(true)}
        onOpenSearch={() => setShowSearch(true)} filterActive={filterActive}
      />

      {/* Оба вида смонтированы всегда (как вкладки оболочки): переключение
          «Рекомендации» ↔ «Мои уроки» не сбрасывает ленту и её слайд */}
      <div className={view === 'mine' ? 'feedViewStack' : 'feedViewStack feedViewHidden'}>
        <MyLessons
          visible={visible && view === 'mine'}
          modules={modules ?? []}
          startedIds={startedIds}
          diffVotes={diffVotes}
          onVoteDifficulty={voteDifficulty}
          filterActive={filterActive}
          passesFilter={passesMine}
          onResetFilter={resetDiffFilter}
          soundOn={soundReady}
          onSoundOn={handleSoundOn}
          onSoundBlocked={handleSoundBlocked}
          onOpen={m => setOpenModule(m)}
          onGoFeed={() => setView('feed')}
        />
      </div>
      <div className={view === 'feed' ? 'feedViewStack' : 'feedViewStack feedViewHidden'}>
        {modules === null ? (
          <div className="feedV2Scroll">
            <section className="feedSlide"><div className="feedSkeleton" /></section>
          </div>
        ) : len === 0 ? (
          <div className="feedV2Center">
            {filterActive && circleLen > 0 ? (
              <>
                <div className="feedV2CenterTitle">Ничего не подошло</div>
                <div className="feedV2CenterSub">Ни одна фраза не попала под фильтр сложности</div>
                <button className="mlGoFeedBtn" onClick={resetDiffFilter}>Сбросить фильтр</button>
              </>
            ) : modules.length > 0 ? (
              <>
                <div className="feedV2CenterTitle">Все уроки начаты</div>
                <div className="feedV2CenterSub">Продолжай обучение во вкладке «Мои уроки»</div>
                <button className="mlGoFeedBtn" onClick={() => setView('mine')}>Мои уроки</button>
              </>
            ) : (
              <>
                <div className="feedV2CenterTitle">Лента пуста</div>
                <div className="feedV2CenterSub">{error || 'На сервере пока нет модулей'}</div>
              </>
            )}
          </div>
        ) : (
          <div className="feedV2Scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="feedVirtualTotal" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map(vi => {
                const m = feedModules[vi.index % len]
                const rel = vi.index - activeIdx
                return (
                  <div
                    key={vi.key}
                    className="feedVirtualItem"
                    style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}>
                    <FeedSlide
                      module={m}
                      slideKey={vi.index}
                      active={rel === 0}
                      near={Math.abs(rel) <= 1}
                      spoilerNear={rel !== 0 && Math.sign(rel) === scrollDir}
                      tabVisible={visible && view === 'feed'}
                      gradIdx={(vi.index % len) % 4}
                      reaction={reactions[m.id]}
                      likeCount={social?.likeCount?.[m.id] ?? 0}
                      saveCount={m.saveCount}
                      repostCount={m.repostCount}
                      difficulty={displayDifficulty(m, diffVotes[m.id])}
                      myDifficulty={diffVotes[m.id]}
                      onVoteDifficulty={v => voteDifficulty(m.id, v)}
                      soundOn={soundReady}
                      onSoundOn={handleSoundOn}
                      onSoundBlocked={handleSoundBlocked}
                      onToggleLike={() => toggle(m.id, 'liked')}
                      onToggleSave={() => toggle(m.id, 'saved')}
                      onLearn={() => setOpenModule(m)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {showDebug && <DebugPanel getFeedInfo={feedInfo} onClose={() => setShowDebug(false)} />}
      {showSearch && (
        <FeedSearchPanel
          modules={modules ?? []}
          diffSelected={diffSelected}
          onToggleDiff={toggleDiff}
          onClose={() => setShowSearch(false)}
          onJumpToModule={jumpToModule}
        />
      )}
    </div>
  )
}
