import { useState, useRef, useEffect, memo } from 'react'
import { Heart, Bookmark, Check } from 'lucide-react'
import { logRepost } from '../../shared/api/moduleSocialApi.js'
import { useSlowMotion } from './useSlowMotion.js'
import DifficultyBadge from './DifficultyBadge.jsx'
import FeedSlowStrip from './FeedSlowStrip.jsx'
import SlowHint from './SlowHint.jsx'
import { useTapPop } from './useTapPop.js'

const SLOW_HINT_SEEN_MS = 400 // сколько держать зону, чтобы подсказка засчиталась «увиденной»

// HUD-колонка справа (иконки-силуэты: залиты, без подложек и теней, см. feed-hud.css): лайк/закладка/репост/сложность + зона замедления 0.5x
// над лайком (useSlowMotion). Общий для ленты (FeedSlide) и «Моих уроков»
// (MyLessonSlide) — вынесен сюда, чтобы не дублировать кнопки и логику.
// showSlowHint/onSlowHintSeen (обучающая подсказка про замедление) передаёт
// только FeedSlide — в «Моих уроках» её не показываем (см. useSlowMotionHint.js).
// catchStrip (только FeedSlide): накрытие «Ловли слов» в DOM — рисуем правую полосу замедления над ним (FeedSlowStrip) на
// том же useSlowMotion; showCatchHint/onCatchHintSeen — её собственная подсказка с отдельным счётчиком (useCatchSlowHint.js)
function FeedHud({
  module: mod, slideKey, active, soundOn,
  reaction, likeCount, saveCount = 0, repostCount = 0,
  onToggleLike, onToggleSave,
  difficulty, myDifficulty, onVoteDifficulty,
  showSlowHint = false, onSlowHintSeen,
  catchStrip = false, showCatchHint = false, onCatchHintSeen,
}) {
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const [likeBurst, setLikeBurst] = useState(false)
  const burstTimer = useRef(null)
  useEffect(() => () => clearTimeout(burstTimer.current), [])
  const [savePop, popSave] = useTapPop()
  const [sharePop, popShare] = useTapPop()
  const liked = !!reaction?.liked
  const saved = !!reaction?.saved

  const { slowMotion, startSlowMotion, stopSlowMotion } = useSlowMotion(slideKey, active, soundOn)
  // Подсказка про замедление гаснет не от касания, а только когда пользователь
  // реально удержал зону и застал эффект (не мгновенный тап) — SLOW_HINT_SEEN_MS
  // держим меньше, чем длится сам жест, чтобы «увидеть» замедление успело
  const slowHintTimer = useRef(null)
  function armSeen(onSeen) {
    clearTimeout(slowHintTimer.current)
    if (onSeen) slowHintTimer.current = setTimeout(onSeen, SLOW_HINT_SEEN_MS)
  }
  function handleSlowStart(e) {
    startSlowMotion(e)
    if (showSlowHint) armSeen(onSlowHintSeen)
  }
  // Правая полоса «Ловли» — то же замедление; «увидена» засчитывается её подсказке (а не обычной)
  function handleStripHold() {
    startSlowMotion(null)
    if (showCatchHint) armSeen(onCatchHintSeen)
  }
  function handleSlowEnd(e) {
    stopSlowMotion(e)
    clearTimeout(slowHintTimer.current)
  }
  useEffect(() => () => clearTimeout(slowHintTimer.current), [])

  function showToast(text, icon) {
    setToast({ text, icon })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  function share() {
    popShare()
    const url = `${location.origin}/?m=${mod.id}`
    logRepost(mod.id)
    if (navigator.share) {
      navigator.share({ title: mod.title, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
      showToast('Ссылка скопирована')
    }
  }

  // Разлёт зелёных сердечек — только на постановку лайка, не на снятие
  function handleLike() {
    if (!liked) {
      setLikeBurst(true)
      clearTimeout(burstTimer.current)
      burstTimer.current = setTimeout(() => setLikeBurst(false), 750)
    }
    onToggleLike()
  }

  // Тост с галочкой — только когда фраза действительно сохраняется
  function handleSave() {
    popSave()
    if (!saved) showToast('Сохранено в закладки', 'check')
    onToggleSave()
  }

  return (
    <>
      {catchStrip && (
        <FeedSlowStrip active={active} showHint={showCatchHint} onHoldStart={handleStripHold} onHoldEnd={handleSlowEnd} />
      )}
      <div className="feedHud">
        <div
          className="feedSlowZone"
          onPointerDown={handleSlowStart}
          onPointerUp={handleSlowEnd}
          onPointerCancel={handleSlowEnd}
          aria-hidden="true"
        />
        {showSlowHint && (
          <SlowHint />
        )}
        <button
          className={liked ? `feedHudBtn feedHudBtnLikeOn${likeBurst ? ' feedHudBtnLikePulse' : ''}` : 'feedHudBtn'}
          onClick={handleLike}>
          <Heart className="feedHudIcon" fill="currentColor" />
          <span>{likeCount > 0 ? likeCount : 'Лайк'}</span>
          {likeBurst && (
            <span className="likeBurst" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(i => (
                <Heart key={i} className="likeBurstHeart" fill="currentColor" />
              ))}
            </span>
          )}
        </button>
        <button
          className={`feedHudBtn${saved ? ' feedHudBtnSaveOn' : ''}${savePop ? ' feedHudBtnPop' : ''}`}
          onClick={handleSave} aria-label="Сохранить в закладки">
          <Bookmark className="feedHudIcon" fill="currentColor" />
          {saveCount > 0 && <span>{saveCount}</span>}
        </button>
        <button className={sharePop ? 'feedHudBtn feedHudBtnPop' : 'feedHudBtn'} onClick={share} aria-label="Репост">
          <svg className="feedHudIcon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5l7 7-7 7v-4C7 15 4 17 2 20c0-7 4-11 12-11V5z" /></svg>
          {repostCount > 0 && <span>{repostCount}</span>}
        </button>
        <DifficultyBadge
          level={difficulty}
          myVote={myDifficulty}
          onVote={onVoteDifficulty}
          active={active} />
      </div>

      {slowMotion && <div className="feedSlowLabel">0.5x</div>}

      {toast && (
        <div className="feedToast">
          {toast.icon === 'check' && <Check className="feedToastIcon" strokeWidth={2.5} />}
          <span>{toast.text}</span>
        </div>
      )}
    </>
  )
}

// memo: см. SlideVideo — набор слова в «Ловле» не должен перерисовывать HUD (пропсы от ленты стабильны)
export default memo(FeedHud)
