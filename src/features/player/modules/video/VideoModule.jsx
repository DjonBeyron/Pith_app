import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

const DBL_TAP_MS = 300

export default function VideoModule({ node, file, onDone }) {
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [intrinsic,  setIntrinsic]  = useState(null)
  const [frameDims,  setFrameDims]  = useState(null)
  const [fsVisible,  setFsVisible]  = useState(false)
  const [fsReady,    setFsReady]    = useState(false)
  const [showPlay,   setShowPlay]   = useState(true)
  const videoRef    = useRef(null)
  const fsVideoRef  = useRef(null)
  const frameRef    = useRef(null)
  const tapTimerRef = useRef(null)
  const tapCountRef = useRef(0)
  const doneFiredRef = useRef(false)

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
    setShowPlay(true)
    const v = videoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
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

  // Seek to first frame so browser decodes and renders it (fixes black poster)
  function handleMetadata(e) {
    const v = e.currentTarget
    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
    pLog('VideoModule onLoadedMetadata readyState=', v.readyState, 'duration=', v.duration)
    if (v.readyState >= 1 && v.currentTime === 0) {
      v.currentTime = 0.001 // trigger first-frame decode
    }
  }

  function playWithAudio() {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    v.muted = false
    v.play().catch(err => {
      pLog('VideoModule: play failed:', err.message, '→ muted fallback')
      v.muted = true
      v.play().catch(() => {})
    })
    setShowPlay(false)
  }

  function handleEnded() {
    pLog('VideoModule: ended → show play button')
    setShowPlay(true)
    if (!doneFiredRef.current) {
      doneFiredRef.current = true
      onDone?.()
    }
  }

  // ── Tap: single = play with audio, double = fullscreen ───────────────────
  function handleTap() {
    tapCountRef.current += 1
    if (tapCountRef.current === 1) {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0
        pLog('VideoModule: single tap → play with audio')
        playWithAudio()
      }, DBL_TAP_MS)
    } else {
      clearTimeout(tapTimerRef.current)
      tapCountRef.current = 0
      pLog('VideoModule: double tap → fullscreen')
      openFs()
    }
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
  // fsVideoRef always in DOM so play() is called synchronously inside gesture
  function openFs() {
    videoRef.current?.pause()
    const fs = fsVideoRef.current
    if (fs) {
      setFsReady(false)
      fs.currentTime = 0
      fs.muted = false
      fs.play().catch(() => {
        fs.muted = true
        fs.play().catch(err => pLog('VideoModule FS play failed:', err.message))
      })
    }
    setFsVisible(true)
  }

  function closeFs() {
    fsVideoRef.current?.pause()
    setFsVisible(false)
  }

  useEffect(() => () => clearTimeout(tapTimerRef.current), [])

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              <div ref={frameRef} className="playerVideoCropFrame" onClick={handleTap}>
                <video
                  ref={videoRef}
                  src={src}
                  className="playerVideoMedia"
                  style={getMediaStyle()}
                  playsInline preload="auto"
                  onLoadedMetadata={handleMetadata}
                  onEnded={handleEnded}
                  onError={e => pLog('VideoModule onError', e.currentTarget.error?.code)}
                />
                {showPlay && <PlayBtn />}
              </div>

              {/* Dark background — below the video */}
              {fsVisible && (
                <div className="videoFsBg" onClick={closeFs} />
              )}

              {/* Video always in DOM at fixed position — play() must be in gesture context */}
              <video
                ref={fsVideoRef}
                src={src}
                playsInline preload="none"
                style={{
                  position: 'fixed', inset: 0, margin: 'auto',
                  zIndex: fsVisible ? 252 : -1,
                  opacity: fsVisible && fsReady ? 1 : 0,
                  pointerEvents: 'none',
                  maxWidth: '100vw', maxHeight: '100vh',
                  width: 'auto', height: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
                onCanPlay={() => setFsReady(true)}
                onError={e => pLog('VideoModule FS onError', e.currentTarget.error?.code)}
              />

              {/* Close button + spinner above video */}
              {fsVisible && (
                <div className="videoFsControls" style={{ zIndex: 253 }}>
                  <button className="videoFullClose" onClick={closeFs}>×</button>
                  {!fsReady && <div className="videoFullSpinner" />}
                </div>
              )}
            </>
          : <div className="playerMediaPlaceholder">Видео не загружено</div>
        }
      </PlayerBubble>
    </div>
  )
}

function PlayBtn() {
  return (
    <div className="videoPlayBtn" aria-label="Воспроизвести">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="rgba(0,0,0,0.45)" />
        <polygon points="19,14 37,24 19,34" fill="white" />
      </svg>
    </div>
  )
}
