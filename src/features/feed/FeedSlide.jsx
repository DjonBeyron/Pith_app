import { useState, useRef, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'
import SlideVideo from './SlideVideo.jsx'
import PhraseBubbleSpoiler from './PhraseBubbleSpoiler.jsx'
import FeedHud from './FeedHud.jsx'

// Один слайд ленты: видео-слой (SlideVideo), фраза под спойлером, HUD
// (лайк/закладка/репост/сложность — FeedHud), кнопка «Изучить фразу».
// Состояние лайков живёт в FeedTab, спойлер локален для каждой копии
// слайда в круге.
export default function FeedSlide({
  module: mod, gradIdx, reaction, likeCount, saveCount = 0, repostCount = 0, tabVisible = true,
  active = false, near = false, spoilerNear = false, slideKey,
  difficulty, myDifficulty, onVoteDifficulty,
  soundOn, onSoundOn, onSoundBlocked, onToggleLike, onToggleSave, onLearn,
  showSlowHint = false, onSlowHintSeen,
}) {
  // Подпись «X уроков в модуле» спрятана за фразой и выкатывается из-под
  // неё с небольшой задержкой после тапа — не одновременно с разлётом
  // шариков, а чуть следом, отдельным движением
  const [subOpen, setSubOpen] = useState(false)
  const subTimer = useRef(null)
  useEffect(() => () => clearTimeout(subTimer.current), [])
  function unlockSub() {
    subTimer.current = setTimeout(() => setSubOpen(true), 320)
  }

  // Уроки контента = между Стартом и Финалом
  const lessonsCount = Math.max(0, mod.lessonIds.length - 2)

  return (
    <section className={`feedSlide feedGrad${gradIdx}`}>
      <SlideVideo
        videoUrl={mod.videoUrl}
        posterUrl={mod.posterUrl}
        slideKey={slideKey}
        active={active}
        near={near}
        tabVisible={tabVisible}
        soundOn={soundOn}
        onSoundOn={onSoundOn}
        onSoundBlocked={onSoundBlocked}
        fallback={<div className="feedSlideHint">здесь будет видео фразы</div>}
      />

      <div className="feedPhraseBlock">
        {/* Шариками спойлера накрыта только сама фраза — подпись «X уроков»
            не спойлер, ей не нужны шарики (меньше высота = меньше шариков).
            Сама подпись спрятана за фразой и выкатывается из-под неё по тапу */}
        <div className="feedPhraseStack">
          <PhraseBubbleSpoiler active={active} near={spoilerNear} onUnlock={unlockSub}>
            <div className="feedPhrase">{mod.title}</div>
          </PhraseBubbleSpoiler>
          <div className={subOpen ? 'feedPhraseSub feedPhraseSubOpen' : 'feedPhraseSub'}>
            {lessonsCount} {plural(lessonsCount, 'урок', 'урока', 'уроков')} в модуле
          </div>
        </div>
      </div>

      <FeedHud
        module={mod}
        slideKey={slideKey}
        active={active}
        soundOn={soundOn}
        reaction={reaction}
        likeCount={likeCount}
        saveCount={saveCount}
        repostCount={repostCount}
        onToggleLike={onToggleLike}
        onToggleSave={onToggleSave}
        difficulty={difficulty}
        myDifficulty={myDifficulty}
        onVoteDifficulty={onVoteDifficulty}
        showSlowHint={showSlowHint}
        onSlowHintSeen={onSlowHintSeen}
      />

      {/* Превью-статус модуля: виден в ленте, но учить пока нельзя (см. useFeedModules) */}
      {!mod.previewOnly && (
        <button className="feedLearnBtn" onClick={onLearn}>
          <Zap fill="currentColor" />
          Изучить фразу
        </button>
      )}
    </section>
  )
}
