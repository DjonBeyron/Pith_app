import { useState, useRef, useEffect } from 'react'

// Видео-слой слайда — общий для «Рекомендаций» и «Моих уроков».
// Кто активен/сосед — решает родитель по позиции скролла (пропсы active/near):
// это надёжнее IntersectionObserver, который в webview-средах может молчать.
// Постер мгновенно, видео монтируется у соседей (префетч), играет активный.
// Тап по видео — пауза/продолжить (сбрасывается при уходе со слайда).
export default function SlideVideo({
  videoUrl, posterUrl, active = false, near = false, tabVisible = true,
  soundOn = false, onSoundOn, onSoundBlocked, fallback = null,
}) {
  const [mediaReady, setMediaReady] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const videoRef = useRef(null)
  const wasActiveRef = useRef(false)
  const hasVideo = !!videoUrl

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (active && !userPaused) {
      if (!wasActiveRef.current) v.currentTime = 0
      v.play().catch(() => {
        // iOS блокирует автозвук при холодном старте — играем без звука
        if (!v.muted) {
          v.muted = true
          v.play().catch(() => {})
          onSoundBlocked?.()
        }
      })
    } else {
      v.pause()
    }
    wasActiveRef.current = active
  }, [active, near, userPaused]) // eslint-disable-line react-hooks/exhaustive-deps

  // Свайпнул со слайда — пользовательская пауза сбрасывается
  useEffect(() => {
    if (active || !userPaused) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserPaused(false)
  }, [active, userPaused])

  if (!hasVideo) return fallback

  return (
    <div className="slideVideoRoot" onClick={() => setUserPaused(p => !p)}>
      {!mediaReady && <div className="feedSkeleton" />}
      {posterUrl && (
        <img className="feedMedia" src={posterUrl} alt="" onLoad={() => setMediaReady(true)} />
      )}
      {(near || active) && (
        <video
          ref={videoRef}
          className="feedMedia"
          src={videoUrl}
          poster={posterUrl ?? undefined}
          preload="auto"
          muted={!soundOn || !tabVisible}
          loop
          playsInline
          onLoadedData={() => setMediaReady(true)}
        />
      )}
      {userPaused && (
        <div className="slidePauseIcon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z" /></svg>
        </div>
      )}
      {!soundOn && active && (
        <button
          className="feedSoundChip"
          onClick={e => { e.stopPropagation(); onSoundOn?.() }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
          Включить звук
        </button>
      )}
    </div>
  )
}
