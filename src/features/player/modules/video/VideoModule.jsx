import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

export default function VideoModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intrinsic, setIntrinsic] = useState(null)
  const [frameDims, setFrameDims] = useState(null)
  const [fsVisible, setFsVisible] = useState(false)
  const [fsReady,   setFsReady]   = useState(false)
  const videoRef      = useRef(null)
  const fsVideoRef    = useRef(null)
  const frameRef      = useRef(null)
  const progressRef   = useRef(null)
  const rafRef        = useRef(null)
  const touchStartY   = useRef(0)
  const doneFiredRef  = useRef(false)
  const fsOpenRef     = useRef(false)  // fullscreen сейчас открыт
  const tapCooldown   = useRef(false)  // защита от частых тапов (1 сек)

  const crop = node.typeData?.video?.crop ?? { x: 0, y: 0, scale: 1 }

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.video?.r2Url ?? null

  useEffect(() => {
    pLog('VideoModule src=', src ? (src.startsWith('blob:') ? 'blob:...' : src) : 'null')
    setIntrinsic(null)
    doneFiredRef.current = false
    if (progressRef.current) progressRef.current.style.width = '0%'
  }, [src])

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    setFrameDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  function getMediaStyle() {
    if (!intrinsic || !frameDims) return {
      width: '100%', height: '100%', objectFit: 'cover',
      transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
    const { w: fw, h: fh } = frameDims
    const ma = intrinsic.w / intrinsic.h
    const fa = fw / fh
    const d = ma > fa ? { w: fh * ma, h: fh } : { w: fw, h: fw / ma }
    return {
      position: 'absolute', left: '50%', top: '50%',
      width: d.w + 'px', height: d.h + 'px',
      transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px)) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
  }

  // onDone срабатывает только из fullscreen (не из тихого inline-цикла).
  // Если пользователь досмотрел ≥20% и закрыл — считаем просмотренным.
  function fireDone() {
    if (doneFiredRef.current) return
    doneFiredRef.current = true
    pLog('VideoModule: onDone()')
    onDone?.()
  }

  // rAF loop for smooth progress bar
  function startRaf() {
    const tick = () => {
      const v = fsVideoRef.current
      const bar = progressRef.current
      if (v && bar && v.duration) {
        bar.style.width = `${(v.currentTime / v.duration) * 100}%`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stopRaf() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  // Tap → fullscreen with audio
  function handleTap() {
    if (tapCooldown.current) return
    tapCooldown.current = true
    setTimeout(() => { tapCooldown.current = false }, 1000)

    videoRef.current?.pause()
    const fs = fsVideoRef.current
    if (fs) {
      setFsReady(false)
      if (progressRef.current) progressRef.current.style.width = '0%'
      fs.currentTime = 0
      fs.muted = false
      const playPromise = fs.play().catch(() => {
        pLog('VideoModule: FS unmuted failed → muted')
        fs.muted = true
        return fs.play().catch(err => pLog('VideoModule: FS muted failed:', err.message))
      })
      // play() resolved = видео реально пошло; если onCanPlay не сработал (уже в буфере) — ставим ready
      Promise.resolve(playPromise).then(() => {
        if (fs.readyState >= 3) setFsReady(true)
      }).catch(() => {})
    }
    fsOpenRef.current = true
    startRaf()
    setFsVisible(true)
  }

  function closeFs() {
    // Если досмотрел ≥20% — считаем просмотренным
    const fs = fsVideoRef.current
    if (fs?.duration) {
      const watched = fs.currentTime / fs.duration
      pLog('VideoModule: closeFs watched=', Math.round(watched * 100) + '%')
      if (watched >= 0.2) fireDone()
    }
    fsOpenRef.current = false
    stopRaf()
    if (fs) { fs.pause(); fs.currentTime = 0 }  // сброс в 0 — при повторном открытии нет флеша старого кадра
    setFsVisible(false)
    if (progressRef.current) progressRef.current.style.width = '0%'
    const v = videoRef.current
    if (v) { v.muted = true; v.play().catch(() => {}) }
  }

  function handleFsEnded() {
    pLog('VideoModule: FS ended → onDone + close')
    if (progressRef.current) progressRef.current.style.width = '100%'
    fireDone()
    // Небольшая задержка чтобы прогресс-бар дошёл до 100% перед закрытием
    setTimeout(closeFs, 300)
  }

  // Swipe down to close fullscreen
  function onFsTouchStart(e) { touchStartY.current = e.touches[0].clientY }
  function onFsTouchEnd(e) {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) closeFs()
  }

  useEffect(() => () => stopRaf(), [])

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              <div ref={frameRef} className="playerVideoCropFrame" onClick={handleTap}>
                <video
                  ref={videoRef} src={src} className="playerVideoMedia"
                  style={getMediaStyle()} playsInline autoPlay muted loop preload="auto"
                  onLoadedMetadata={e => {
                    const v = e.currentTarget
                    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
                    pLog('VideoModule meta rs=', v.readyState)
                  }}
                  onError={e => pLog('VideoModule onError', e.currentTarget.error?.code)}
                />
                <MutedIcon />
              </div>

              {fsVisible && (
                <div className="videoFsBg" onClick={closeFs}
                  onTouchStart={onFsTouchStart} onTouchEnd={onFsTouchEnd} />
              )}

              <video
                ref={fsVideoRef} src={src} playsInline preload="none"
                style={{
                  position: 'fixed', inset: 0, margin: 'auto',
                  zIndex: fsVisible ? 252 : -1,
                  opacity: fsVisible && fsReady ? 1 : 0,
                  pointerEvents: 'none',
                  maxWidth: '100vw', maxHeight: '100vh',
                  width: 'auto', height: 'auto', display: 'block',
                }}
                onCanPlay={() => setFsReady(true)}
                onEnded={handleFsEnded}
                onError={e => pLog('VideoModule FS onError', e.currentTarget.error?.code)}
              />

              {fsVisible && (
                <div className="videoFsControls" style={{ zIndex: 253 }}
                  onTouchStart={onFsTouchStart} onTouchEnd={onFsTouchEnd}>
                  <button className="videoFullClose" onClick={closeFs}>×</button>
                  {!fsReady && <div className="videoFullSpinner" />}
                  <div className="videoFsProgressTrack">
                    <div ref={progressRef} className="videoFsProgressBar" style={{ width: '0%' }} />
                  </div>
                </div>
              )}
            </>
          : <div className="playerMediaPlaceholder">Видео не загружено</div>
        }
      </PlayerBubble>
    </div>
  )
}

function MutedIcon() {
  return (
    <div className="videoMutedIcon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M11 5L6 9H2v6h4l5 4V5z" fill="white" fillOpacity="0.9"/>
        <line x1="23" y1="9" x2="17" y2="15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <line x1="17" y1="9" x2="23" y2="15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  )
}
