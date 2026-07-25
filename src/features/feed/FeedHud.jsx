import { useState, useRef, useEffect } from 'react'
import { Heart, Bookmark, Check, Fingerprint } from 'lucide-react'
import { logRepost } from '../../shared/api/moduleSocialApi.js'
import { useSlowMotion } from './useSlowMotion.js'
import DifficultyBadge from './DifficultyBadge.jsx'

const SLOW_HINT_SEEN_MS = 400 // сколько держать зону, чтобы подсказка засчиталась «увиденной»

// HUD-колонка справа: лайк/закладка/репост/сложность + зона замедления 0.5x
// над лайком (useSlowMotion). Общий для ленты (FeedSlide) и «Моих уроков»
// (MyLessonSlide) — вынесен сюда, чтобы не дублировать кнопки и логику.
// showSlowHint/onSlowHintSeen (обучающая подсказка про замедление) передаёт
// только FeedSlide — в «Моих уроках» её не показываем (см. useSlowMotionHint.js).
export default function FeedHud({
  module: mod, slideKey, active, soundOn,
  reaction, likeCount, saveCount = 0, repostCount = 0,
  onToggleLike, onToggleSave,
  difficulty, myDifficulty, onVoteDifficulty,
  showSlowHint = false, onSlowHintSeen,
}) {
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const [likeBurst, setLikeBurst] = useState(false)
  const burstTimer = useRef(null)
  useEffect(() => () => clearTimeout(burstTimer.current), [])
  const liked = !!reaction?.liked
  const saved = !!reaction?.saved

  const { slowMotion, startSlowMotion, stopSlowMotion } = useSlowMotion(slideKey, active, soundOn)
  // Подсказка про замедление гаснет не от касания, а только когда пользователь
  // реально удержал зону и застал эффект (не мгновенный тап) — SLOW_HINT_SEEN_MS
  // держим меньше, чем длится сам жест, чтобы «увидеть» замедление успело
  const slowHintTimer = useRef(null)
  function handleSlowStart(e) {
    startSlowMotion(e)
    if (showSlowHint) {
      slowHintTimer.current = setTimeout(() => onSlowHintSeen?.(), SLOW_HINT_SEEN_MS)
    }
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
    if (!saved) showToast('Сохранено в закладки', 'check')
    onToggleSave()
  }

  return (
    <>
      <div className="feedHud">
        <div
          className="feedSlowZone"
          onPointerDown={handleSlowStart}
          onPointerUp={handleSlowEnd}
          onPointerCancel={handleSlowEnd}
          aria-hidden="true"
        />
        {showSlowHint && (
          <div className="feedSlowHint" aria-hidden="true">
            <Fingerprint className="feedSlowHintIcon" />
            <span className="feedSlowHintText">Зажми, чтобы замедлить</span>
          </div>
        )}
        <button
          className={liked ? 'feedHudBtn feedHudBtnOn' : 'feedHudBtn'}
          onClick={handleLike}>
          <Heart fill={liked ? 'currentColor' : 'none'} />
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
          className={saved ? 'feedHudBtn feedHudBtnOn' : 'feedHudBtn'}
          onClick={handleSave} aria-label="Сохранить в закладки">
          <Bookmark fill={saved ? 'currentColor' : 'none'} />
          {saveCount > 0 && <span>{saveCount}</span>}
        </button>
        <button className="feedHudBtn" onClick={share} aria-label="Репост">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5l7 7-7 7v-4C7 15 4 17 2 20c0-7 4-11 12-11V5z" /></svg>
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
