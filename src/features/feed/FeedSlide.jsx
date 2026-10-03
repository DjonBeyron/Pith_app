import { useState, useRef, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'
import SlideVideo from './SlideVideo.jsx'
import PhraseBubbleSpoiler from './PhraseBubbleSpoiler.jsx'
import PhraseWords from './PhraseWords.jsx'
import PhraseTranslationRow from './PhraseTranslationRow.jsx'
import RubHint from './RubHint.jsx'
import WordTranslateLine from './WordTranslateLine.jsx'
import { useWordTranslate } from './useWordTranslate.js'
import { useSlideRecall } from './useSlideRecall.js'
import { useTranslationReveal } from './useTranslationReveal.js'
import FeedHud from './FeedHud.jsx'

// Один слайд ленты: видео-слой (SlideVideo), фраза под спойлером (перевод фразы появляется, когда её потёрли пальцем —
// useTranslationReveal), HUD (лайк/закладка/репост/сложность — FeedHud), кнопка «Изучить фразу».
// Состояние лайков живёт в FeedTab, спойлер локален для каждой копии
// слайда в круге.
export default function FeedSlide({
  module: mod, gradIdx, reaction, likeCount, saveCount = 0, repostCount = 0, tabVisible = true,
  active = false, near = false, slideKey,
  difficulty, myDifficulty, onVoteDifficulty,
  soundOn, soundEverOn, onSoundOn, onSoundOff, onSoundBlocked, onToggleLike, onToggleSave, onLearn,
  showSlowHint = false, onSlowHintSeen,
  showRubHint = false, onRubHintSeen, onPhraseOpened, // обучающая подсказка «потри фразу» (useRubHint): показ, «воспользовался», «фраза открыта»
  knowledge = null, // { stepOf, settledOf } — память слов: цвет слов по ступеням (feedKnowledge.js)
  recall = null,    // повторение слов фразы (useFeedRecall): что к повтору, запас вариантов, лимиты
  onLearnChanged,   // ответ на проверку слова изменил память — лента обновит данные «Моего обучения»
}) {
  // revealed — фраза уже открыта (слова становятся кликабельными сразу, перевод фразы можно тереть)
  const [revealed, setRevealed] = useState(false)
  // Пословный перевод названия: тап по слову — линия с подложкой (см.
  // WordTranslateLine). Координаты считаются относительно самого слайда
  const rootRef = useRef(null)
  const wordTr = useWordTranslate(rootRef)
  const { pick, close } = wordTr
  // Слово фразы со сроком «сегодня»: дышит, по тапу — проверка вместо перевода (useSlideRecall)
  const rc = useSlideRecall({ recall, mod, active, revealed, knowledge, wp: wordTr, onChanged: onLearnChanged })
  // Перевод фразы: спрятан, пока её не потёрли; стрелка прячет его обратно, подпись «перевести» остаётся до ухода со слайда
  const { phase: trPhase, setSub, rubProps, toggle: toggleTr } = useTranslationReveal({ active, modId: mod.id, enabled: revealed && !!mod.titleTranslation, onRubbed: onRubHintSeen })
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
        soundEverOn={soundEverOn}
        onSoundOn={onSoundOn}
        onSoundOff={onSoundOff}
        onSoundBlocked={onSoundBlocked}
        fallback={<div className="feedSlideHint">здесь будет видео фразы</div>}
      />

      <div className="feedPauseGuard" aria-hidden="true" />

      <div className="feedPhraseBlock">
        {/* Шариками спойлера накрыта только сама фраза — строка перевода не
            спойлер, ей не нужны шарики (меньше высота = меньше шариков). Сама строка спрятана за фразой
            и выкатывается, когда фразу потёрли */}
        <div className="feedPhraseStack">
          {showRubHint && revealed && trPhase === 'off' && !!mod.titleTranslation && <RubHint />}
          <PhraseBubbleSpoiler active={active} tabVisible={tabVisible} onUnlock={() => { setRevealed(true); onPhraseOpened?.() }}>
            <div className="feedPhrase" {...rubProps}>
              <PhraseWords
                title={mod.title}
                entries={mod.wordTranslations}
                activeIndex={pick && !(pick.closing && !pick.soft) ? pick.index : -1}
                enabled={revealed}
                onPick={rc.onPick}
                levelOf={rc.levelOf}
                lureIndex={rc.lureIndex}
                tint={rc.tint}
              />
            </div>
          </PhraseBubbleSpoiler>
          {!!mod.titleTranslation && (
            <div ref={setSub} className={trPhase === 'off' ? 'feedPhraseSub' : 'feedPhraseSub feedPhraseSubOpen'}>
              <PhraseTranslationRow
                text={mod.titleTranslation}
                open={trPhase === 'open'}
                peek={trPhase === 'off'}
                onToggle={toggleTr}
              />
            </div>
          )}
        </div>
      </div>

      {pick && <WordTranslateLine key={pick.id} pick={pick} onClose={close} onAnswer={rc.answer} />}

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
