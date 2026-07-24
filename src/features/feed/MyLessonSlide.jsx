import { displayDifficulty } from '../../shared/api/difficultyApi.js'
import { useSlowMotion } from './useSlowMotion.js'
import SlideVideo from './SlideVideo.jsx'
import DifficultyBadge from './DifficultyBadge.jsx'

// Один слайд видео-режима «Моих уроков»: та же зона замедления (0.5x над
// зоной HUD), что и в ленте (FeedSlide) — вынесен из MyLessons.jsx, чтобы
// useSlowMotion жил в своём компоненте на каждый слайд цикла .map()
export default function MyLessonSlide({
  module: m, gradIdx, active, near, tabVisible,
  soundOn, onSoundOn, onSoundBlocked,
  myDifficulty, onVoteDifficulty, onOpen,
}) {
  const { slowMotion, startSlowMotion, stopSlowMotion } = useSlowMotion(`ml-${m.id}`, active, soundOn)

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
      <div className="feedHud">
        <div
          className="feedSlowZone"
          onPointerDown={startSlowMotion}
          onPointerUp={stopSlowMotion}
          onPointerCancel={stopSlowMotion}
          aria-hidden="true"
        />
        <DifficultyBadge
          level={displayDifficulty(m, myDifficulty, true)}
          myVote={myDifficulty}
          onVote={v => onVoteDifficulty?.(m.id, v)}
          active={active} />
      </div>
      {slowMotion && <div className="feedSlowLabel">0.5x</div>}
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
