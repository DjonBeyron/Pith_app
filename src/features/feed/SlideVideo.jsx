import { useState, useRef, useEffect } from 'react'
import { getSharedVideo, parkSharedVideo } from './sharedVideoElement.js'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Видео-слой слайда — общий для «Рекомендаций» и «Моих уроков».
// Кто активен — решает родитель по позиции скролла (пропс active): это
// надёжнее IntersectionObserver, который в webview-средах может молчать.
// Сам <video> — единый на всю ленту (sharedVideoElement): активный слайд
// «забирает» его к себе, ставит свой src и играет; неактивные показывают
// только постер. Так элемент не пересоздаётся при скролле — звук не гаснет
// и нет дёрганья. Тап по видео — пауза/продолжить (сбрасывается при уходе).
export default function SlideVideo({
  videoUrl, posterUrl, active = false, tabVisible = true,
  soundOn = false, onSoundOn, onSoundBlocked, fallback = null,
}) {
  const [paused, setPaused] = useState(false)
  const rootRef = useRef(null)
  const hasVideo = !!videoUrl

  // Пока слайд активен — держим общий <video> внутри себя и на своём src.
  // Парковка в cleanup только при деактивации/смене src (soundOn/paused сюда
  // не входят — иначе на каждый тап звука был бы перескок и мигание).
  useEffect(() => {
    if (!active || !hasVideo || !tabVisible) return
    const v = getSharedVideo()
    const root = rootRef.current
    if (!root) return
    if (v.parentElement !== root) {
      const t = (performance.now() / 1000).toFixed(2)
      fdbg(`REPARENT видео → слайд ...${videoUrl.slice(-14)} @${t}s`)
      root.appendChild(v)
    }
    if (v.dataset.url !== videoUrl) {
      v.dataset.url = videoUrl
      v.src = videoUrl
    } else {
      try { v.currentTime = 0 } catch { /* не критично */ }
    }
    return () => {
      const el = getSharedVideo()
      if (el.parentElement === root) parkSharedVideo()
    }
  }, [active, hasVideo, tabVisible, videoUrl])

  // Звук/воспроизведение отдельно — реагирует на soundOn и ручную паузу,
  // не трогая позицию элемента в DOM
  useEffect(() => {
    if (!active || !hasVideo || !tabVisible) return
    const v = getSharedVideo()
    if (v.parentElement !== rootRef.current) return
    v.muted = !soundOn
    if (!paused) {
      v.play().catch(() => {
        // Свежий src ещё не «благословлён» звуком — играем без него
        if (!v.muted) {
          v.muted = true
          v.play().catch(() => {})
          onSoundBlocked?.()
        }
      })
    } else {
      v.pause()
    }
  }, [active, hasVideo, tabVisible, soundOn, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ушли со слайда — ручная пауза сбрасывается
  useEffect(() => {
    if (active || !paused) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaused(false)
  }, [active, paused])

  // Тап по чипу — это жест пользователя: проигрываем общий элемент со звуком
  // прямо здесь, чтобы браузер разблокировал его на всю сессию (дальше звук
  // переживает смену слайдов и src)
  function tapSound(e) {
    e.stopPropagation()
    const v = getSharedVideo()
    v.muted = false
    v.play().catch(() => {})
    onSoundOn?.()
  }

  if (!hasVideo) return fallback

  return (
    <div className="slideVideoRoot" ref={rootRef} onClick={() => active && setPaused(p => !p)}>
      {posterUrl
        ? <img className="feedMedia feedPoster" src={posterUrl} alt="" />
        : <div className="feedSkeleton" />}
      {paused && active && (
        <div className="slidePauseIcon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z" /></svg>
        </div>
      )}
      {!soundOn && active && (
        <button className="feedSoundChip" onClick={tapSound}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
          Включить звук
        </button>
      )}
    </div>
  )
}
