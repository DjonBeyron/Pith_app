import { useState, useRef, useEffect, useCallback } from 'react'
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
import { useSlideCatch } from './catch/useSlideCatch.js'
import CatchOverChip from './catch/CatchOverChip.jsx'
import CatchCover from './catch/CatchCover.jsx'

// Один слайд ленты: видео-слой (SlideVideo), фраза под спойлером (перевод фразы появляется, когда её потёрли пальцем —
// useTranslationReveal), HUD (лайк/закладка/репост/сложность — FeedHud), кнопка «Изучить фразу».
// «Ловля слов» (catch/): если лента поставила на фразу задание, вместо шариков — чип «Проверь, что услышал» на всю ширину
// невидимой фразы (ни canvas, ни картинки покоя); тап по чипу или по блоку открывает накрытие (CatchCover: полоска фразы + шторка
// набора) и блокирует свайп (onLock). Пока оно открыто — класс feedSlideCatchOpen и --catch-cover-h (его высота):
// иконка паузы и чипы звука сдвигаются вверх (feed-catch.css). «Готово» → слайд обычный открытый (revealed).
// Состояние лайков живёт в FeedTab, спойлер локален для каждой копии слайда в круге.
const PHRASE_OPENED_DELAY_MS = 260 // после «Готово» и размонтирования накрытия: фраза уже проявляется (200мс)

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
  catchFeed = null, // «Ловля слов» на уровне ленты (useFeedCatch): лимиты, claim
  onLock,           // панель набора открыта → лента не свайпается (только у активного слайда)
}) {
  // revealed — фраза уже открыта (слова становятся кликабельными сразу, перевод фразы можно тереть);
  // «Готово» на финале «Ловли слов» (ct.finished — после ухода накрытия) открывает её так же
  const [opened, setRevealed] = useState(false)
  // Пословный перевод названия: тап по слову — линия с подложкой (см.
  // WordTranslateLine). Координаты считаются относительно самого слайда
  const rootRef = useRef(null)
  const wordTr = useWordTranslate(rootRef)
  const { pick, close } = wordTr
  // Слово фразы со сроком «сегодня»: дышит, по тапу — проверка вместо перевода (useSlideRecall)
  // Сюда идёт opened (состояние), а не revealed: revealed считается ниже из ct.finished, а ct зависит от rc.candIndex —
  // обращение к const до объявления роняло весь слайд (ReferenceError, v3.2.1873). После «Готово» эффект ниже
  // переводит opened в true, и приманка повторения снова работает как у обычной открытой фразы
  const rc = useSlideRecall({ recall, mod, active, revealed: opened, knowledge, wp: wordTr, onChanged: onLearnChanged })
  // «Ловля слов»: задание ставится, если на слайде нет слова «Помнишь?» (rc.candIndex) — оно главнее
  const ct = useSlideCatch({ feedCatch: catchFeed, mod, active, knowledge, recallIndex: rc.candIndex, onLock, onLearnChanged })
  // «Готово» на финале задания идёт по порядку (useSlideCatch): накрытие уезжает (260мс) → размонтируется → ТОЛЬКО ТОГДА
  // слайд = обычный открытый (ct.finished: спойлер не рендерится, на его месте слова фразы) и блок фразы проявляется
  // (200мс). До этого момента в кадрах ухода накрытия ни тяжёлого рендера фразы, ни setState ленты (v3.2.1876: рывок)
  const revealed = opened || ct.finished
  // Админ отправил эту фразу в ленту принудительно (Админ → «Ловля» → «Отправить в ленту»), а фраза в этой сессии
  // уже была открыта — закрываем её обратно, иначе задание негде показать (чип живёт только над шариками)
  useEffect(() => {
    if (!ct.forced || !opened || ct.done) return
    const t = setTimeout(() => setRevealed(false), 0)
    return () => clearTimeout(t)
  }, [ct.forced]) // eslint-disable-line react-hooks/exhaustive-deps
  // Состояние «фраза открыта» и сигнал ленте — позже, когда фраза уже проявилась (setState через таймер, правило react-hooks)
  useEffect(() => {
    if (!ct.finished) return
    const t = setTimeout(() => { setRevealed(true); onPhraseOpened?.() }, PHRASE_OPENED_DELAY_MS)
    return () => clearTimeout(t)
  }, [ct.finished]) // eslint-disable-line react-hooks/exhaustive-deps
  // Высота накрытия (шторка + полоска) — в CSS-переменную слайда прямо через style.setProperty, без setState:
  // иначе каждое измерение перерисовывало бы весь слайд (видео, HUD, фраза). CatchCover шлёт 0 при закрытии/размонтировании,
  // до первого открытия переменной нет — в CSS fallback 0px
  // follow=true — высота меняется кадр за кадром (клавиатура сворачивается на «Проверить»): иконки едут без собственного
  // перехода (--catch-icon-ms: 0), иначе — плавно 260мс (feed-catch.css)
  const setCoverH = useCallback((h, follow = false) => {
    const st = rootRef.current?.style
    if (!st) return
    st.setProperty('--catch-cover-h', `${h}px`)
    st.setProperty('--catch-icon-ms', follow ? '0ms' : '260ms')
  }, [])
  // Перевод фразы: спрятан, пока её не потёрли; стрелка прячет его обратно, подпись «перевести» остаётся до ухода со слайда
  const { phase: trPhase, setSub, rubProps, toggle: toggleTr } = useTranslationReveal({ active, modId: mod.id, enabled: revealed && !!mod.titleTranslation, onRubbed: onRubHintSeen })
  // Ушли с этого слайда свайпом — подсказку убираем. Отдельно закрываем её и
  // при подмене модуля в той же копии слайда (лента крутится по кругу и
  // переиспользует смонтированные слайды — иначе остался бы чужой перевод)
  useEffect(() => { if (!active) close() }, [active, close])
  useEffect(() => { close() }, [mod.id, close])

  // Уроки контента = между Стартом и Финалом
  const lessonsCount = Math.max(0, mod.lessonIds.length - 2)

  // Открытая фраза по словам — под спойлером и после задания ловли одна и та же
  const phraseWords = (
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
  )

  return (
    <section
      className={`feedSlide feedGrad${gradIdx}${ct.open ? ' feedSlideCatchOpen' : ''}`}
      ref={rootRef}
    >
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

      {/* Пока накрытие «Ловли» в DOM (ct.mounted) блок фразы гаснет (opacity 200мс, feed-catch.css) — шарики в ленте
          не живут одновременно с массой в полоске; после «Готово» он возвращается уже с открытой фразой */}
      <div className={`feedPhraseBlock${ct.mounted ? ' feedPhraseBlockHidden' : ''}`}>
        {/* Шариками спойлера накрыта только сама фраза — строка перевода не
            спойлер, ей не нужны шарики (меньше высота = меньше шариков). Сама строка спрятана за фразой
            и выкатывается, когда фразу потёрли */}
        <div className="feedPhraseStack">
          {showRubHint && revealed && trPhase === 'off' && !!mod.titleTranslation && <RubHint />}
          {revealed ? (
            <div className="feedPhrase" {...rubProps}>{phraseWords}</div>
          ) : ct.active ? (
            // Задание есть: шариков нет вовсе (ни canvas, ни картинки покоя) — на их месте невидимая копия фразы той же
            // ширины/высоты (раскладка не прыгает) и чип поверх; тап по блоку открывает шторку. Живёт только canvas полоски
            <div className="catchSpoilerWrap" onClick={e => { e.stopPropagation(); ct.openSheet() }}>
              <div className="catchPhraseGhost" aria-hidden="true">
                <div className="feedPhrase">{phraseWords}</div>
              </div>
              <CatchOverChip hidden={ct.open || ct.done} onOpen={ct.openSheet} />
            </div>
          ) : (
            <PhraseBubbleSpoiler active={active} tabVisible={tabVisible} onUnlock={() => { setRevealed(true); onPhraseOpened?.() }}>
              <div className="feedPhrase" {...rubProps}>{phraseWords}</div>
            </PhraseBubbleSpoiler>
          )}
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

      {ct.mounted && (
        <CatchCover
          open={ct.open} onHeight={setCoverH} live={active && tabVisible}
          title={mod.title} words={ct.words} cur={ct.curIndex} typedBy={ct.typedBy} phase={ct.phase} results={ct.results}
          onPick={ct.setCurrent} helped={ct.helped} model={ct.model} isLast={ct.isLast} hasPrev={ct.hasPrev} shift={ct.shift}
          onKey={ct.press} onBackspace={ct.backspace} onNext={ct.next} onPrev={ct.prev} onCheck={ct.check}
          onHelp={ct.help} onReveal={ct.reveal} onFinish={ct.finish}
        />
      )}

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
