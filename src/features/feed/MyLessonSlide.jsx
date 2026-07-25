import { displayDifficulty } from '../../shared/api/difficultyApi.js'
import SlideVideo from './SlideVideo.jsx'
import FeedHud from './FeedHud.jsx'

// Один слайд видео-режима «Моих уроков»: тот же HUD (лайк/закладка/репост/
// сложность/замедление 0.5x), что и в ленте (FeedSlide) — общий FeedHud.jsx.
// Обучающей подсказки про замедление здесь нет (showSlowHint не передаём) —
// она только в «Рекомендациях», см. useSlowMotionHint.js.
export default function MyLessonSlide({
  module: m, gradIdx, active, near, tabVisible,
  soundOn, onSoundOn, onSoundBlocked,
  reaction, likeCount, onToggleLike, onToggleSave,
  myDifficulty, onVoteDifficulty, onOpen,
}) {
  return (
    <section className={`feedSlide feedGrad${gradIdx}`}>
      <SlideVideo
        videoUrl={m.videoUrl}
        posterUrl={m.posterUrl}
        slideKey={`ml-${m.id}`}
        active={active}
        near={near}
        tabVisible={tabVisible}
        soundOn={soundOn}
        onSoundOn={onSoundOn}
        onSoundBlocked={onSoundBlocked}
        fallback={<div className="feedSlideHint">видео начатого модуля</div>}
      />
      <div className="mlPhrase">{m.title}</div>
      {/* Свой голос в приоритете: «мои сложные» = сложные для меня */}
      <FeedHud
        module={m}
        slideKey={`ml-${m.id}`}
        active={active}
        soundOn={soundOn}
        reaction={reaction}
        likeCount={likeCount}
        saveCount={m.saveCount}
        repostCount={m.repostCount}
        onToggleLike={onToggleLike}
        onToggleSave={onToggleSave}
        difficulty={displayDifficulty(m, myDifficulty, true)}
        myDifficulty={myDifficulty}
        onVoteDifficulty={v => onVoteDifficulty?.(m.id, v)}
      />
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
  )
}
