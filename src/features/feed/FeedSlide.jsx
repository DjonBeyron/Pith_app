import { useState, useRef, useEffect, useCallback } from 'react'
import { Zap } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'
import SlideMedia from './scene/SlideMedia.jsx'
import PhraseBubbleSpoiler from './PhraseBubbleSpoiler.jsx'
import PhraseWords from './PhraseWords.jsx'
import PhraseTranslationRow from './PhraseTranslationRow.jsx'
import RubHint from './RubHint.jsx'
import WordTranslateLine from './WordTranslateLine.jsx'
import { useWordTranslate } from './useWordTranslate.js'
import { useSlideRecall } from './useSlideRecall.js'
import { useTranslationReveal } from './useTranslationReveal.js'
import { usePhrasePlate } from './usePhrasePlate.js'
import { phraseSurface } from './phraseSurface.js'
import FeedHud from './FeedHud.jsx'
import { useSlideCatch } from './catch/useSlideCatch.js'
import { useCatchPrepare } from './catch/useCatchPrepare.js'
import CatchOverChip from './catch/CatchOverChip.jsx'
import CatchCover from './catch/CatchCover.jsx'
import { useCatchSlowHint } from './catch/useCatchSlowHint.js'
import { useCatchSlideGlue } from './catch/useCatchSlideGlue.js'
import { track } from '../../shared/lib/analytics/track.js'
import { FEED_PHRASE_OPEN } from '../../shared/lib/analytics/eventNames.js'

// Один слайд ленты: видео-слой (SlideVideo), фраза под спойлером (перевод фразы появляется, когда её потёрли пальцем —
// useTranslationReveal), HUD (лайк/закладка/репост/сложность — FeedHud), кнопка «Изучить фразу».
// «Ловля слов» (catch/): если лента поставила на фразу задание, вместо шариков — чип в две строки «Проверь» / «всё ли удалось
// услышать» на всю ширину невидимой фразы (ни canvas, ни картинки покоя); тап по чипу или по блоку открывает накрытие
// (CatchCover: полоска фразы + шторка набора) и блокирует свайп (onLock). Пока оно открыто — класс feedSlideCatchOpen и
// --catch-cover-h (его высота): иконка паузы и чипы звука сдвигаются вверх (feed-catch.css). «Готово» → слайд обычный
// открытый (revealed); фраза под уходящим накрытием уже готова (useCatchPrepare, ниже).
// Состояние лайков живёт в FeedTab, спойлер локален для каждой копии слайда в круге.
// Производительность набора: состояние «Ловли» (набранное, активное слово) живёт здесь, в useSlideCatch, поэтому каждая
// клавиша перерисовывает FeedSlide. Тяжёлые дети обёрнуты в React.memo (SlideVideo, FeedHud, PhraseWords; внутри накрытия —
// CatchStripPhrase и CatchSheet), а их пропсы стабильны: действия хука — стабильные обёртки, onPick слов — обёртка над
// ref, заглушка видео — константа. На клавише реально перерисовывается только оболочка слайда и строка набранного.
// Заглушка видео — один элемент на модуль: новый JSX в пропсе ломал бы React.memo у SlideVideo на каждой клавише «Ловли»
const VIDEO_FALLBACK = <div className="feedSlideHint">здесь будет видео фразы</div>

export default function FeedSlide({
  module: mod, gradIdx, reaction, likeCount, saveCount = 0, repostCount = 0, tabVisible = true,
  active = false, near = false, ahead = false, slideKey,
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
  // «Ловля слов»: фраза открывается заранее, под накрытием (useCatchPrepare), а «Готово» (ct.finished) довершает так же
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
  const ct = useSlideCatch({ feedCatch: catchFeed, mod, active, near, ahead, knowledge, recallIndex: rc.candIndex, onLock, onLearnChanged })
  // Пока накрытие открыто, правая полоса видео над ним — зона замедления (FeedSlowStrip в FeedHud, едет по --catch-cover-h);
  // подсказка о ней — свой счётчик (useCatchSlowHint)
  const slowHint = useCatchSlowHint(ct.open && active, soundOn)
  // onPick слов фразы — стабильная обёртка (rc.onPick каждый рендер новая функция и ломала бы memo у PhraseWords)
  const rcRef = useRef(rc)
  useEffect(() => { rcRef.current = rc })
  const onWordPick = useCallback((...args) => rcRef.current.onPick(...args), [])
  // Финал задания идёт по порядку (useSlideCatch): на «Проверить»/«Раскрыть» через ~320мс фраза «готовится» — opened=true,
  // слова и подложка монтируются внутри ещё скрытого блока (useCatchPrepare; дёшево, вне кадров ухода). «Готово» (ct.done) →
  // блок снимается со скрытия мгновенно (feedPhraseBlockRise) под непрозрачным накрытием; накрытие не движется — его заливает цветом панели (180мс) и оно гаснет (140мс), открывая
  // уже готовую фразу — без пустого места и «второго акта». Тяжёлое (onPhraseOpened, onLock(false), память) — ПОСЛЕ
  // размонтирования накрытия (ct.finished), не в кадрах ухода (v3.2.1876: рывок). Не успела подготовиться — как раньше:
  // после ухода накрытия фраза проявляется fade 200мс
  const revealed = opened || ct.finished
  useCatchPrepare({ ct, opened, rootRef, onPrepare: () => setRevealed(true) })
  const rise = ct.mounted && ct.done && opened // накрытие заливается и гаснет над уже подготовленной фразой
  // Склейка с накрытием (счётчики DBG, --catch-cover-h без setState, принудительное задание админа на открытой фразе,
  // сигнал «фраза открыта» после ухода накрытия) — useCatchSlideGlue
  const { setCoverH } = useCatchSlideGlue({ ct, rootRef, opened, setRevealed, onPhraseOpened })
  // Перевод фразы: спрятан, пока её не потёрли; стрелка прячет его обратно, подпись «перевести» остаётся до ухода со слайда
  const { phase: trPhase, setSub, rubProps, toggle: toggleTr } = useTranslationReveal({ active, modId: mod.id, enabled: revealed && !!mod.titleTranslation, onRubbed: onRubHintSeen })
  // Подложка под фразой: проступает, когда фраза открыта; с открытым переводом накрывает и его (feed-phrase-plate.css).
  // Геометрию (по тексту, не по блоку) usePhrasePlate кладёт в CSS-переменные стопки без setState
  const stackRef = useRef(null)
  usePhrasePlate(stackRef, `${revealed}|${ct.active}|${mod.id}|${!!mod.titleTranslation}`)
  const plateOn = revealed && (!ct.mounted || rise) // на «Готово» — сразу, под накрытием (feedPhrasePlateNow: без fade)
  const surface = phraseSurface({ ctActive: ct.active, revealed }) // что на месте фразы: шарики / чип ловли / открытая фраза
  const plateCls = `feedPhrasePlate${plateOn ? ' feedPhrasePlateOn' : ''}${rise ? ' feedPhrasePlateNow' : ''}${trPhase === 'open' ? ' feedPhrasePlateTr' : ''}`
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
      onPick={onWordPick}
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
      {/* Медиа слайда: сцена «два кота» (mod.sceneId) главнее видео, нет/не загрузилась → видео (scene/SlideMedia.jsx) */}
      <SlideMedia
        sceneId={mod.sceneId ?? null}
        videoUrl={mod.videoUrl}
        posterUrl={mod.posterUrl}
        slideKey={slideKey}
        moduleId={mod.id}
        active={active}
        near={near}
        tabVisible={tabVisible}
        soundOn={soundOn}
        soundEverOn={soundEverOn}
        onSoundOn={onSoundOn}
        onSoundOff={onSoundOff}
        onSoundBlocked={onSoundBlocked}
        fallback={VIDEO_FALLBACK}
        onLock={onLock} // задание «О чём диалог» на слайде-сцене блокирует свайп, как «Ловля» (scene/useSceneTask.js)
      />

      <div className="feedPauseGuard" aria-hidden="true" />

      {/* Пока накрытие «Ловли» в DOM (ct.mounted) блок фразы гаснет (opacity 200мс, feed-catch.css) — шарики в ленте
          не живут одновременно с массой в полоске; на «Готово» с подготовленной фразой (rise) скрытие снимается мгновенно
          под уходящим накрытием, иначе — после его ухода, fade 200мс */}
      <div className={`feedPhraseBlock${ct.mounted && !rise ? ' feedPhraseBlockHidden' : ''}${rise ? ' feedPhraseBlockRise' : ''}`}>
        {/* Шариками спойлера накрыта только сама фраза — строка перевода не
            спойлер, ей не нужны шарики (меньше высота = меньше шариков). Сама строка спрятана за фразой
            и выкатывается, когда фразу потёрли */}
        <div className="feedPhraseStack" ref={stackRef}>
          <i className={plateCls} aria-hidden="true" />
          {showRubHint && revealed && !ct.mounted && trPhase === 'off' && !!mod.titleTranslation && <RubHint />}
          {surface === 'plain' ? (
            <div className="feedPhrase" {...rubProps}>{phraseWords}</div>
          ) : surface === 'chip' ? (
            // Задание есть: шариков нет вовсе (ни canvas, ни картинки покоя) — на их месте невидимая копия фразы той же
            // ширины/высоты (раскладка не прыгает) и чип поверх; тап по блоку открывает шторку. Живёт только canvas полоски
            <div className="catchSpoilerWrap" onClick={e => { e.stopPropagation(); ct.openSheet() }}>
              <div className="catchPhraseGhost" aria-hidden="true">
                <div className="feedPhrase">{phraseWords}</div>
              </div>
              <CatchOverChip hidden={ct.open || ct.done} onOpen={ct.openSheet} />
            </div>
          ) : (
            <PhraseBubbleSpoiler active={active} tabVisible={tabVisible} onUnlock={() => { setRevealed(true); track(FEED_PHRASE_OPEN, { module_id: mod.id }); onPhraseOpened?.() }}>
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
          open={ct.open} onHeight={setCoverH} onClosed={ct.coverGone} live={active && tabVisible}
          title={mod.title} words={ct.words} cur={ct.curIndex} typedBy={ct.typedBy} phase={ct.phase} results={ct.results}
          onPick={ct.setCurrent} helped={ct.helped} model={ct.model} isLast={ct.isLast} hasPrev={ct.hasPrev} shift={ct.shift}
          onKey={ct.press} onBackspace={ct.backspace} onNext={ct.next} onPrev={ct.prev} onCheck={ct.check}
          onHelp={ct.help} onReveal={ct.reveal} onLater={ct.later} onFinish={ct.finish}
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
        catchStrip={ct.mounted} showCatchHint={slowHint.showHint} onCatchHintSeen={slowHint.retire}
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
