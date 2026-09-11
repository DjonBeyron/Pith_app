import { useState, useRef, useEffect } from 'react'
import { Zap, Video, List, Play, Puzzle } from 'lucide-react'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { listLessonBookmarks } from '../../shared/lib/lessonBookmarksApi.js'
import { listLessonsWithProgress } from '../../shared/lib/lessonProgressApi.js'
import { simulateLessonsDone } from '../../shared/lib/adminTestCompletion.js'
import { fetchLessonTitles } from '../../shared/lib/lessonsApi.js'
import { plural } from '../../shared/lib/plural.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import { useAuth } from '../../shared/lib/useAuth.js'
import { readCachedBookmarks, writeCachedBookmarks } from './lessonBookmarkCache.js'
import MyLessonSlide from './MyLessonSlide.jsx'
import MyLessonRefSlide from './MyLessonRefSlide.jsx'

// «Мои уроки»: начатые модули (user_module_progress) в двух режимах —
// видео-скролл (без HUD, прогресс-бар модуля снизу) и список с процентами.
// Без спойлера: названия начатых модулей открыты. Гость видит пустое состояние.
// startedIds приходит из FeedTab (единый источник) — обновляется при открытии
// вкладки и при возврате из модуля, поэтому только что начатый урок появляется
// здесь сразу (раньше был свой independent fetch, он рассинхронивался).
export default function MyLessons({
  visible = true, modules, startedIds, onOpen, onOpenLesson, onGoFeed,
  diffVotes = {}, onVoteDifficulty,
  filterActive = false, passesFilter, onResetFilter,
  soundOn, soundEverOn, onSoundOn, onSoundOff, onSoundBlocked,
  reactions = {}, likeCounts = {}, onToggle,
}) {
  // Режим (видео/список) запоминается между запусками
  const [mode, setModeState] = useState(() =>
    localStorage.getItem('pithy_ml_mode') === 'list' ? 'list' : 'video')
  function setMode(m) {
    setModeState(m)
    localStorage.setItem('pithy_ml_mode', m)
  }
  // Активный слайд видео-режима — из позиции скролла (без IntersectionObserver)
  const [activeIdx, setActiveIdx] = useState(0)
  const scrollRef = useRef(null)

  function onScroll() {
    const el = scrollRef.current
    if (!el || !el.clientHeight) return
    setActiveIdx(Math.round(el.scrollTop / el.clientHeight))
  }

  // Уроки-закладки (LessonRefModule.jsx «В закладки») — отдельные строки, без
  // своего модуля вокруг (StandaloneLessonRunner.jsx). Перечитываем при
  // каждом показе вкладки — закладка могла появиться, пока «Мои уроки» были
  // не видны (переход по ссылке живёт в отдельном дереве, LessonNavOverlay.jsx)
  const [bookmarkedLessons, setBookmarkedLessons] = useState([])
  // Пока ответ сервера не пришёл, показываем зеркало из localStorage: иначе
  // строки-закладки дорисовывались на ~100 мс позже модулей (те приходят
  // готовыми пропсами, а эти — тремя запросами подряд)
  const [bmLoaded, setBmLoaded] = useState(false)
  // Активные чекпойнты (пройден урок не до конца ИЛИ пересдаётся заново после
  // 100%) — lessonId → pct. По нему модуль/урок на 100% временно снова виден
  // здесь, с текущим процентом пересдачи (см. useLessonResume.js)
  const [progressMap, setProgressMap] = useState(new Map())
  const { isAdmin } = useAdmin()
  // Кэш закладок привязан к аккаунту: на общем устройстве чужие не мелькнут
  const { user } = useAuth()
  // completed читается из localStorage заново на каждый рендер (не state) —
  // после теста «пометить пройденным» нужен просто любой ре-рендер
  const [, forceTick] = useState(0)
  function markModuleDoneForTest(m) {
    simulateLessonsDone(m.lessonIds)
    forceTick(t => t + 1)
  }
  function markLessonDoneForTest(id) {
    simulateLessonsDone([id])
    forceTick(t => t + 1)
  }

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    ;(async () => {
      const bmIds = [...await listLessonBookmarks()]
      const titles = bmIds.length ? await fetchLessonTitles(bmIds) : {}
      if (cancelled) return
      const list = bmIds.map(id => ({ id, title: titles[id] ?? 'Урок' }))
      setBookmarkedLessons(list)
      setBmLoaded(true)
      writeCachedBookmarks(user?.id, list)

      const moduleLessonIds = modules.flatMap(m => m.lessonIds)
      const progress = await listLessonsWithProgress([...new Set([...moduleLessonIds, ...bmIds])])
      if (!cancelled) setProgressMap(progress)
    })()
    return () => { cancelled = true }
    // modules нарочно не в зависимостях: список пересчитывается на каждый
    // чих ленты (лайки/закладки модулей) — перечитывать чекпойнты нужно
    // только при реальном показе вкладки, не на каждый ре-рендер родителя
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const completed = getCompletedLessons()
  const startedAll = modules
    .filter(m => startedIds.has(m.id))
    .map(m => {
      const total = m.lessonIds.length
      const done  = m.lessonIds.filter(id => completed.has(id)).length
      // Пока какой-то урок модуля пересдаётся — держим на экране его текущий
      // процент вместо 100% (сам факт «пройден навсегда» это не меняет)
      const pausedPct = m.lessonIds.reduce((acc, id) => Math.max(acc, progressMap.get(id) ?? 0), 0)
      const isPaused = done === total && m.lessonIds.some(id => progressMap.has(id))
      return { ...m, total, done, pct: isPaused ? pausedPct : (total ? Math.round((done / total) * 100) : 0), isPaused }
    })
    // 100% модуль скрываем — «пройден навсегда»; пока пересдаётся хотя бы
    // один его урок (см. isPaused выше) — виден снова
    .filter(m => m.pct < 100 || m.isPaused)
  // Фильтр сложности: свой голос в приоритете (иначе общий); серые видны всегда
  const started = filterActive && passesFilter
    ? startedAll.filter(m => passesFilter(m, diffVotes[m.id]))
    : startedAll

  // Уроки-закладки: скрываем завершённые НАВСЕГДА (пройдены, чекпойнта нет);
  // не завершённые и те, что сейчас пересдаются — видны, с текущим процентом
  // До ответа сервера — зеркало; после — только настоящий список (иначе
  // удалённая на другом устройстве закладка висела бы вечно)
  const shownBookmarks = bmLoaded ? bookmarkedLessons : readCachedBookmarks(user?.id)
  const visibleLessons = shownBookmarks
    .filter(l => !completed.has(l.id) || progressMap.has(l.id))
    .map(l => ({
      ...l,
      pct: progressMap.get(l.id) ?? (completed.has(l.id) ? 100 : 0),
      paused: progressMap.has(l.id),
    }))

  if (startedAll.length === 0 && visibleLessons.length === 0) {
    return (
      <div className="feedV2Center">
        <div className="mlEmptyArt">
          <Zap fill="currentColor" />
        </div>
        <div className="feedV2CenterTitle">Здесь пока пусто</div>
        <div className="feedV2CenterSub">Начни обучение — выбери фразу в ленте<br />и нажми «Изучить фразу»</div>
        <button className="mlGoFeedBtn" onClick={onGoFeed}>Смотреть ленту</button>
      </div>
    )
  }

  if (started.length === 0 && visibleLessons.length === 0) {
    return (
      <div className="feedV2Center">
        <div className="feedV2CenterTitle">Ничего не подошло</div>
        <div className="feedV2CenterSub">Ни одна фраза не попала под фильтр сложности</div>
        <button className="mlGoFeedBtn" onClick={onResetFilter}>Сбросить фильтр</button>
      </div>
    )
  }

  return (
    <div className="mlWrap">
      <div className="mlModeToggle">
        <button className={mode === 'video' ? 'mlModeBtn mlModeBtnActive' : 'mlModeBtn'}
          onClick={() => setMode('video')} title="Видео">
          <Video />
        </button>
        <button className={mode === 'list' ? 'mlModeBtn mlModeBtnActive' : 'mlModeBtn'}
          onClick={() => setMode('list')} title="Список">
          <List />
        </button>
      </div>

      {mode === 'video' ? (
        <div className="feedV2Scroll" ref={scrollRef} onScroll={onScroll}>
          {started.map((m, i) => (
            <MyLessonSlide
              key={m.id}
              module={m}
              gradIdx={i % 4}
              active={i === activeIdx}
              near={Math.abs(i - activeIdx) <= 1}
              tabVisible={visible && mode === 'video'}
              soundOn={soundOn}
              soundEverOn={soundEverOn}
              onSoundOn={onSoundOn}
              onSoundOff={onSoundOff}
              onSoundBlocked={onSoundBlocked}
              reaction={reactions[m.id]}
              likeCount={likeCounts[m.id] ?? 0}
              onToggleLike={() => onToggle(m.id, 'liked')}
              onToggleSave={() => onToggle(m.id, 'saved')}
              myDifficulty={diffVotes[m.id]}
              onVoteDifficulty={onVoteDifficulty}
              onOpen={onOpen}
            />
          ))}
          {visibleLessons.map(l => (
            <MyLessonRefSlide key={l.id} lesson={l} onOpen={() => onOpenLesson(l.id)} />
          ))}
        </div>
      ) : (
        <div className="mlList">
          {started.map((m, i) => (
            <div key={m.id} className="mlRowShell">
              <button className="mlRow" onClick={() => onOpen(m)}>
                <span className={`mlThumb feedGrad${i % 4}`}>
                  {m.posterUrl ? (
                    /* Кадр настраивается админом в панели 🎬 (poster_crop) */
                    <img className="mlThumbImg" src={m.posterUrl} alt=""
                      style={m.posterCrop ? {
                        transform: `translate(${m.posterCrop.x ?? 0}%, ${m.posterCrop.y ?? 0}%) scale(${m.posterCrop.scale ?? 1})`,
                      } : undefined} />
                  ) : m.videoUrl ? (
                    /* Постера нет — кадр из видео; seek заставляет браузер
                       реально отрисовать кадр (иначе бывает чёрный) */
                    <video className="mlThumbImg" src={`${m.videoUrl}#t=0.1`}
                      preload="metadata" muted playsInline
                      onLoadedMetadata={e => { try { e.currentTarget.currentTime = 0.1 } catch { /* не критично */ } }} />
                  ) : (
                    <Play fill="currentColor" />
                  )}
                </span>
                <span className="mlRowBody">
                  <span className="mlRowTitle">{m.title}</span>
                  <span className="mlRowSub">
                    {m.isPaused
                      ? 'Пересдаётся — на паузе'
                      : m.pct === 100
                        ? 'Модуль пройден'
                        : `Пройдено ${m.done} из ${m.total} ${plural(m.total, 'урока', 'уроков', 'уроков')} · осталось ${m.total - m.done}`}
                  </span>
                  <span className="mlRowTrack">
                    <span className="mlTrack"><span className="mlFill" style={{ width: `${m.pct}%` }} /></span>
                    <b className="mlPct">{m.pct}%</b>
                  </span>
                </span>
              </button>
              {isAdmin && (
                <button className="mlRowAdminMark" title="Тест: пометить весь модуль пройденным (без начисления XP)"
                  onClick={e => { e.stopPropagation(); markModuleDoneForTest(m) }}>✔</button>
              )}
            </div>
          ))}
          {visibleLessons.map(l => (
            <div key={l.id} className="mlRowShell">
              <button className="mlRow" onClick={() => onOpenLesson(l.id)}>
                {/* Минималистичный тумб без названия урока внутри картинки —
                    само название уже подписано текстом строкой ниже */}
                <span className="mlThumb mlThumbLesson"><Puzzle fill="currentColor" /></span>
                <span className="mlRowBody">
                  <span className="mlRowTitle">{l.title}</span>
                  <span className="mlRowSub">
                    {l.paused ? 'На паузе' : l.pct === 0 ? 'Урок из закладок' : 'Урок пройден'}
                  </span>
                  <span className="mlRowTrack">
                    <span className="mlTrack"><span className="mlFill" style={{ width: `${l.pct}%` }} /></span>
                    <b className="mlPct">{l.pct}%</b>
                  </span>
                </span>
              </button>
              {isAdmin && (
                <button className="mlRowAdminMark" title="Тест: пометить урок пройденным (без начисления XP)"
                  onClick={e => { e.stopPropagation(); markLessonDoneForTest(l.id) }}>✔</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
