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

  // ── First frame debug ────────────────────────────────────────────────────
  function logState(label, v) {
    pLog(`VideoModule [${label}] readyState=${v.readyState} networkState=${v.networkState} currentTime=${v.currentTime.toFixed(3)} duration=${v.duration} src=${v.src ? (v.src.startsWith('blob:') ? 'blob' : 'url') : 'none'}`)
  }

  function handleMetadata(e) {
    const v = e.currentTarget
    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
    logState('onLoadedMetadata', v)
    // Try seek to first frame after metadata
    v.currentTime = 0.001
    pLog('VideoModule: set currentTime=0.001 after metadata')
  }

  function handleLoadedData(e) {
    const v = e.currentTarget
    logState('onLoadedData', v)
  }

  function handleCanPlay(e) {
    const v = e.currentTarget
    logState('onCanPlay', v)
    // If seek to 0.001 didn't work yet, try again now
    if (v.currentTime < 0.0005 && !v.paused === false) {
      pLog('VideoModule: re-seek to 0.001 in onCanPlay')
      v.currentTime = 0.001
    }
  }

  function handleSeeked(e) {
    const v = e.currentTarget
    logState('onSeeked', v)
    pLog('VideoModule: seeked → frame should be visible now')
  }

  function seekToFirstFrame() {
    const v = videoRef.current
    if (!v) return
    pLog('VideoModule: seekToFirstFrame currentTime before=', v.currentTime)
    v.currentTime = 0.001
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
    pLog('VideoModule: ended')
    setShowPlay(true)
    seekToFirstFrame()
    if (!doneFiredRef.current) {
      doneFiredRef.current = true
      onDone?.()
    }
  }

  // ── Tap ──────────────────────────────────────────────────────────────────
  function handleTap() {
    tapCountRef.current += 1
    if (tapCountRef.current === 1) {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0
        playWithAudio()
      }, DBL_TAP_MS)
    } else {
      clearTimeout(tapTimerRef.current)
      tapCountRef.current = 0
      openFs()
    }
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
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
    setShowPlay(true)
    seekToFirstFrame()
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
                  onLoadedData={handleLoadedData}
                  onCanPlay={handleCanPlay}
                  onSeeked={handleSeeked}
                  onEnded={handleEnded}
                  onError={e => pLog('VideoModule onError', e.currentTarget.error?.code)}
                />
                {showPlay && <PlayBtn />}
              </div>

              {fsVisible && <div className="videoFsBg" onClick={closeFs} />}

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
                  display: 'block',
                }}
                onCanPlay={() => setFsReady(true)}
                onError={e => pLog('VideoModule FS onError', e.currentTarget.error?.code)}
              />

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
