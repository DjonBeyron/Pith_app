import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { pLog } from '../../../../shared/lib/debug.js'
import { VIDEO_GUARD } from '../../../../shared/lib/videoHudGuard.js'
import { useVideoMirror } from '../../videoMirror.js'

// Полноэкранный просмотр видео по тапу — портал в document.body (position:fixed
// должен считаться от вьюпорта, а не от containing block PlayerFeed's scaleY(-1)).
// Прогресс-бар крутится RAF-циклом по currentTime/duration полноэкранного
// видео. Закрытие — по фону/крестику; досмотр ≥20% засчитывает onDone.
// Вынесено из VideoModule.jsx — там же остаётся инлайн-воспроизведение в
// пузыре (videoAutoSound, захват frame0, кроп-стиль).
export function useVideoFullscreen({ src, frame0, crop, intrinsic, frameDims, mirror, doneFiredRef, fireDone, frameRef, videoRef }) {
  const [fsVisible, setFsVisible] = useState(false)
  const [fsSrc, setFsSrc]         = useState(null)
  const [stageDims, setStageDims] = useState(null)
  const [fsReady, setFsReady]     = useState(false)

  const fsVideoRef  = useRef(null)
  const fsMirrorRef = useRef(null)
  const progressRef = useRef(null)
  const rafRef       = useRef(null)
  const fsOpenRef     = useRef(false)
  const tapCooldown   = useRef(false)

  // На десктопе кадры показывает canvas, а сам <video> прячется (см. videoMirror.js)
  useVideoMirror(fsVideoRef, fsMirrorRef, mirror && fsVisible && !!fsSrc, frame0)

  function getFsMediaStyle() {
    if (!intrinsic || !frameDims) {
      return {
        position: 'absolute', inset: 0,
        width: '100%', height: '100%', objectFit: 'cover',
      }
    }
    const sw = stageDims?.w ?? window.innerWidth
    const sh = stageDims?.h ?? window.innerHeight
    const ma = intrinsic.w / intrinsic.h
    const faFs = sw / sh
    const dFs = ma > faFs ? { w: sh * ma, h: sh } : { w: sw, h: sw / ma }
    const faIn = frameDims.w / frameDims.h
    const dIn = ma > faIn ? { w: frameDims.h * ma, h: frameDims.h } : { w: frameDims.w, h: frameDims.w / ma }
    const sx = dFs.w / dIn.w
    const sy = dFs.h / dIn.h
    return {
      position: 'absolute', left: '50%', top: '50%',
      width: dFs.w + 'px', height: dFs.h + 'px',
      transform: `translate(calc(-50% + ${crop.x * sx}px), calc(-50% + ${crop.y * sy}px)) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
  }

  function startRaf() {
    const tick = () => {
      const v = fsVideoRef.current
      const bar = progressRef.current
      if (v && bar && v.duration) bar.style.width = `${(v.currentTime / v.duration) * 100}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stopRaf() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  function handleTap() {
    if (tapCooldown.current) return
    tapCooldown.current = true
    setTimeout(() => { tapCooldown.current = false }, 1000)

    pLog('VideoModule: tap → open FS revisit=', doneFiredRef.current,
      'frame0=', frame0 ? 'yes' : 'no')
    setFsReady(false)
    setFsSrc(src)
    fsOpenRef.current = true
    setFsVisible(true)
    // Полный экран = рамка плеера. На телефоне она равна окну (цифры прежние),
    // на десктопе плеер шириной 420px, и по окну видео уезжало за края
    const box = frameRef.current?.closest('.lessonPlayer')?.getBoundingClientRect()
    setStageDims(box ? { w: box.width, h: box.height } : null)
  }

  // Когда fsSrc появился → воспроизвести с начала
  useEffect(() => {
    if (!fsSrc) return
    const fs = fsVideoRef.current
    if (!fs) return
    pLog('VideoModule: fsSrc set → fs.readyState=', fs.readyState)
    if (progressRef.current) progressRef.current.style.width = '0%'
    fs.currentTime = 0
    fs.muted = false
    startRaf()
    fs.play().catch(() => {
      pLog('VideoModule: FS unmuted failed → muted')
      fs.muted = true
      fs.play().catch(err => pLog('VideoModule: FS muted failed:', err.message))
    })
  }, [fsSrc])

  function handleFsCanPlay() {
    pLog('VideoModule: FS onCanPlay → show video, hide frame0 overlay')
    setFsReady(true)
  }

  function closeFs() {
    if (!fsOpenRef.current) return
    const fs = fsVideoRef.current
    if (fs?.duration) {
      const watched = fs.currentTime / fs.duration
      pLog('VideoModule: closeFs watched=', Math.round(watched * 100) + '%')
      if (watched >= 0.2) fireDone()
    }
    fsOpenRef.current = false
    stopRaf()
    fsVideoRef.current?.pause()
    setFsVisible(false)
    setFsSrc(null)
    setFsReady(false)
    if (progressRef.current) progressRef.current.style.width = '0%'
    const v = videoRef.current
    if (v) { v.muted = true; v.play().catch(() => {}) }
  }

  function handleFsEnded() {
    if (!fsOpenRef.current) return
    if (doneFiredRef.current) {
      pLog('VideoModule: FS ended, revisit → loop from start')
      const fs = fsVideoRef.current
      if (fs) { fs.currentTime = 0; fs.play().catch(() => {}) }
      if (progressRef.current) progressRef.current.style.width = '0%'
      return
    }
    pLog('VideoModule: FS ended → onDone + close')
    if (progressRef.current) progressRef.current.style.width = '100%'
    fireDone()
    setTimeout(closeFs, 300)
  }

  useEffect(() => () => stopRaf(), [])

  // Fullscreen overlay — portalled to document.body so that position:fixed is
  // relative to the viewport, not the PlayerFeed's scaleY(-1) containing block.
  const fsPortal = createPortal(
    <>
      {fsVisible && (
        <div
          className="videoFsBg"
          onClick={closeFs}
          style={{ zIndex: 251, WebkitTapHighlightColor: 'transparent' }}
        />
      )}
      {/* Video container always in DOM so fsVideoRef is always attached */}
      <div style={{
        position: 'fixed', inset: 0,
        zIndex: fsVisible ? 252 : -1,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <video
          {...VIDEO_GUARD}
          ref={fsVideoRef}
          src={fsSrc ?? undefined}
          playsInline
          preload="none"
          className={mirror ? 'videoMirrorSource' : undefined}
          style={mirror ? undefined : getFsMediaStyle()}
          onCanPlay={handleFsCanPlay}
          onPlaying={() => pLog('VideoModule: FS onPlaying')}
          onWaiting={() => pLog('VideoModule: FS onWaiting')}
          onEnded={handleFsEnded}
          onError={e => pLog('VideoModule: FS onError code=', e.currentTarget.error?.code)}
        />
        {mirror && fsVisible && (
          <canvas ref={fsMirrorRef} style={getFsMediaStyle()} aria-hidden="true" />
        )}
        {/* Frame 0 overlay — shown until FS video fires onCanPlay, eliminates black flash */}
        {fsVisible && frame0 && !fsReady && (
          <img
            src={frame0}
            alt=""
            style={getFsMediaStyle()}
          />
        )}
      </div>
      {fsVisible && (
        <div
          className="videoFsControls"
          style={{ zIndex: 253, WebkitTapHighlightColor: 'transparent' }}
        >
          <button className="videoFullClose" onClick={closeFs}>×</button>
          <div className="videoFsProgressTrack">
            <div ref={progressRef} className="videoFsProgressBar" style={{ width: '0%' }} />
          </div>
        </div>
      )}
    </>,
    document.body,
  )

  return { fsPortal, handleTap, fsVideoRef }
}
