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

  // Inline: silent loop, fire onDone at end of first play
  function handleTimeUpdate(e) {
    if (doneFiredRef.current) return
    const v = e.currentTarget
    if (v.duration && v.currentTime >= v.duration - 0.15) {
      doneFiredRef.current = true
      pLog('VideoModule: first loop end → onDone()')
      onDone?.()
    }
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
    videoRef.current?.pause()
    const fs = fsVideoRef.current
    if (fs) {
      setFsReady(false)
      if (progressRef.current) progressRef.current.style.width = '0%'
      fs.currentTime = 0
      fs.muted = false
      fs.play().catch(() => {
        pLog('VideoModule: FS unmuted failed → muted')
        fs.muted = true
        fs.play().catch(err => pLog('VideoModule: FS muted failed:', err.message))
      })
    }
    startRaf()
    setFsVisible(true)
  }

  function closeFs() {
    stopRaf()
    fsVideoRef.current?.pause()
    setFsVisible(false)
    if (progressRef.current) progressRef.current.style.width = '0%'
    const v = videoRef.current
    if (v) { v.muted = true; v.play().catch(() => {}) }
  }

  function handleFsEnded(e) {
    pLog('VideoModule: FS ended → loop with audio')
    const v = e.currentTarget
    if (progressRef.current) progressRef.current.style.width = '0%'
    v.currentTime = 0
    v.play().catch(() => {})
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
                  onTimeUpdate={handleTimeUpdate}
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
