import { useState, useRef } from 'react'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { plural } from '../../shared/lib/plural.js'
import { displayDifficulty } from '../../shared/api/difficultyApi.js'
import SlideVideo from './SlideVideo.jsx'
import DifficultyBadge from './DifficultyBadge.jsx'

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
  soundOn, onSoundOn, onSoundBlocked,
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
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="3" width="16" height="18" rx="3" /></svg>
        </button>
        <button className={mode === 'list' ? 'mlModeBtn mlModeBtnActive' : 'mlModeBtn'}
          onClick={() => setMode('list')} title="Список">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
        </button>
      </div>

      {mode === 'video' ? (
        <div className="feedV2Scroll" ref={scrollRef} onScroll={onScroll}>
          {started.map((m, i) => (
            <section key={m.id} className={`feedSlide feedGrad${i % 4}`}>
              <SlideVideo
                videoUrl={m.videoUrl}
                posterUrl={m.posterUrl}
                slideKey={`ml-${m.id}`}
                active={i === activeIdx}
                near={Math.abs(i - activeIdx) <= 1}
                tabVisible={visible && mode === 'video'}
                soundOn={soundOn}
                onSoundOn={onSoundOn}
                onSoundBlocked={onSoundBlocked}
                fallback={<div className="feedSlideHint">видео начатого модуля</div>}
              />
              <div className="mlPhrase">{m.title}</div>
              {/* Свой голос в приоритете: «мои сложные» = сложные для меня */}
              <div className="feedHud">
                <DifficultyBadge
                  level={displayDifficulty(m, diffVotes[m.id], true)}
                  myVote={diffVotes[m.id]}
                  onVote={v => onVoteDifficulty?.(m.id, v)}
                  active={i === activeIdx} />
              </div>
              <button className="feedLearnBtn mlContinueBtn" onClick={() => onOpen(m)}>
                {m.pct === 100 ? 'Повторить модуль' : 'Продолжить'}
              </button>
              <div className="mlProgress">
                <div className="mlProgressLabel">
                  <span>
                    {m.pct === 100
                      ? 'Модуль пройден'
                      : `Пройдено ${m.done} из ${m.total} · осталось ${m.total - m.done}`}
                  </span>
                  <b>{m.pct}%</b>
                </div>
                <div className="mlTrack"><div className="mlFill" style={{ width: `${m.pct}%` }} /></div>
              </div>
            </section>
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
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z" /></svg>
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
