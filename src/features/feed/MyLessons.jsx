import { useState, useRef } from 'react'
import { Zap, Video, List, Play } from 'lucide-react'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { plural } from '../../shared/lib/plural.js'
import MyLessonSlide from './MyLessonSlide.jsx'

// «Мои уроки»: начатые модули (user_module_progress) в двух режимах —
// видео-скролл (без HUD, прогресс-бар модуля снизу) и список с процентами.
// Без спойлера: названия начатых модулей открыты. Гость видит пустое состояние.
// startedIds приходит из FeedTab (единый источник) — обновляется при открытии
// вкладки и при возврате из модуля, поэтому только что начатый урок появляется
// здесь сразу (раньше был свой independent fetch, он рассинхронивался).
export default function MyLessons({
  visible = true, modules, startedIds, onOpen, onGoFeed,
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

  const completed = getCompletedLessons()
  const startedAll = modules
    .filter(m => startedIds.has(m.id))
    .map(m => {
      const total = m.lessonIds.length
      const done  = m.lessonIds.filter(id => completed.has(id)).length
      return { ...m, total, done, pct: total ? Math.round((done / total) * 100) : 0 }
    })
  // Фильтр сложности: свой голос в приоритете (иначе общий); серые видны всегда
  const started = filterActive && passesFilter
    ? startedAll.filter(m => passesFilter(m, diffVotes[m.id]))
    : startedAll

  if (startedAll.length === 0) {
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

  if (started.length === 0) {
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
        </div>
      ) : (
        <div className="mlList">
          {started.map((m, i) => (
            <button key={m.id} className="mlRow" onClick={() => onOpen(m)}>
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
                  {m.pct === 100
                    ? 'Модуль пройден'
                    : `Пройдено ${m.done} из ${m.total} ${plural(m.total, 'урока', 'уроков', 'уроков')} · осталось ${m.total - m.done}`}
                </span>
                <span className="mlRowTrack">
                  <span className="mlTrack"><span className="mlFill" style={{ width: `${m.pct}%` }} /></span>
                  <b className="mlPct">{m.pct}%</b>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
