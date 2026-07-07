import { useState, useRef } from 'react'
import { plural } from '../../shared/lib/plural.js'
import SlideVideo from './SlideVideo.jsx'

// Один слайд ленты: видео-слой (SlideVideo), фраза под спойлером, HUD
// (лайк/закладка/репост), кнопка «Изучить фразу». Состояние лайков живёт
// в FeedTab, спойлер локален для каждой копии слайда в круге.
export default function FeedSlide({
  module: mod, gradIdx, reaction, likeCount, tabVisible = true,
  active = false, near = false, slideKey,
  soundOn, onSoundOn, onSoundBlocked, onToggleLike, onToggleSave, onLearn,
}) {
  const [toast, setToast] = useState('')
  const [revealed, setRevealed] = useState(false)
  const toastTimer = useRef(null)
  const liked = !!reaction?.liked
  const saved = !!reaction?.saved

  // Уроки контента = между Стартом и Финалом
  const lessonsCount = Math.max(0, mod.lessonIds.length - 2)

  function showToast(text) {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }

  function share() {
    const url = `${location.origin}/?m=${mod.id}`
    if (navigator.share) {
      navigator.share({ title: mod.title, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
      showToast('Ссылка скопирована')
    }
  }

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

      <button
        className={revealed ? 'feedPhraseBlock feedPhraseOpen' : 'feedPhraseBlock'}
        onClick={() => setRevealed(true)}>
        <div className="feedPhrase">{mod.title}</div>
        <div className="feedPhraseSub">
          {lessonsCount} {plural(lessonsCount, 'урок', 'урока', 'уроков')} в модуле
        </div>
        <span className="feedSpoilerNoise" aria-hidden="true" />
      </button>

      <div className="feedHud">
        <button
          className={liked ? 'feedHudBtn feedHudBtnOn' : 'feedHudBtn'}
          onClick={onToggleLike}>
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          <span>{likeCount > 0 ? likeCount : 'Лайк'}</span>
        </button>
        <button
          className={saved ? 'feedHudBtn feedHudBtnOn' : 'feedHudBtn'}
          onClick={onToggleSave}>
          <svg viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6 3h12v18l-6-4.5L6 21V3z" /></svg>
          <span>Сохранить</span>
        </button>
        <button className="feedHudBtn" onClick={share}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5l7 7-7 7v-4C7 15 4 17 2 20c0-7 4-11 12-11V5z" /></svg>
          <span>Репост</span>
        </button>
      </div>

      <button className="feedLearnBtn" onClick={onLearn}>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>
        Изучить фразу
      </button>

      {toast && <div className="feedToast">{toast}</div>}
    </section>
  )
}
