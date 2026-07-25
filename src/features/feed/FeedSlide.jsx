import { useState, useRef, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'
import SlideVideo from './SlideVideo.jsx'
import PhraseBubbleSpoiler from './PhraseBubbleSpoiler.jsx'
import PhraseWords from './PhraseWords.jsx'
import PhraseTranslationRow from './PhraseTranslationRow.jsx'
import WordTranslateLine from './WordTranslateLine.jsx'
import { useWordTranslate } from './useWordTranslate.js'
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
  // Строка «раскрыть перевод» спрятана за фразой и выкатывается из-под неё с
  // небольшой задержкой после тапа — не одновременно с разлётом шариков, а
  // чуть следом, отдельным движением. revealed — сама фраза уже открыта
  // (слова становятся кликабельными сразу, не дожидаясь выката строки)
  const [revealed, setRevealed] = useState(false)
  const [subOpen, setSubOpen] = useState(false)
  const [trOpen, setTrOpen] = useState(false)
  const subTimer = useRef(null)
  useEffect(() => () => clearTimeout(subTimer.current), [])
  function unlockSub() {
    setRevealed(true)
    subTimer.current = setTimeout(() => setSubOpen(true), 320)
  }

  // Пословный перевод названия: тап по слову — линия с подложкой (см.
  // WordTranslateLine). Координаты считаются относительно самого слайда
  const rootRef = useRef(null)
  const { pick, pickWord, close } = useWordTranslate(rootRef)
  // Ушли с этого слайда свайпом — подсказку убираем. Отдельно закрываем её и
  // при подмене модуля в той же копии слайда (лента крутится по кругу и
  // переиспользует смонтированные слайды — иначе остался бы чужой перевод)
  useEffect(() => { if (!active) close() }, [active, close])
  useEffect(() => { close() }, [mod.id, close])

  // Уроки контента = между Стартом и Финалом
  const lessonsCount = Math.max(0, mod.lessonIds.length - 2)

  return (
    <section className={`feedSlide feedGrad${gradIdx}`} ref={rootRef}>
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
        {/* Шариками спойлера накрыта только сама фраза — строка «раскрыть
            перевод» не спойлер, ей не нужны шарики (меньше высота = меньше
            шариков). Сама строка спрятана за фразой и выкатывается по тапу */}
        <div className="feedPhraseStack">
          <PhraseBubbleSpoiler active={active} near={spoilerNear} onUnlock={unlockSub}>
            <div className="feedPhrase">
              <PhraseWords
                title={mod.title}
                entries={mod.wordTranslations}
                activeIndex={pick && !pick.closing ? pick.index : -1}
                enabled={revealed}
                onPick={pickWord}
              />
            </div>
          </PhraseBubbleSpoiler>
          {!!mod.titleTranslation && (
            <div className={subOpen ? 'feedPhraseSub feedPhraseSubOpen' : 'feedPhraseSub'}>
              <PhraseTranslationRow
                text={mod.titleTranslation}
                open={trOpen}
                onToggle={() => setTrOpen(v => !v)}
              />
            </div>
          )}
        </div>
      </div>

      {pick && <WordTranslateLine key={pick.id} pick={pick} onClose={close} />}

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
          <span className="feedLearnCount">
            {lessonsCount} {plural(lessonsCount, 'урок', 'урока', 'уроков')}
          </span>
        </button>
      )}
    </section>
  )
}
