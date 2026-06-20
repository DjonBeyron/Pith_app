import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

const DBL_TAP_MS = 300

export default function VideoModule({ node, file, onDone }) {
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [intrinsic,  setIntrinsic]  = useState(null)
  const [frameDims,  setFrameDims]  = useState(null)
  const [fsVisible,        setFsVisible]       = useState(false)
  const [fsReady,          setFsReady]         = useState(false)
  const [showPlay,         setShowPlay]        = useState(true)
  const [fsShowPlay,       setFsShowPlay]      = useState(false)
  const [afterCanPlay,     setAfterCanPlay]    = useState(false) // true after canplay/seeked

  // frameReady is derived directly from current prop — no closure issues
  const posterUrl  = file?.posterUrl ?? null
  const frameReady = !!posterUrl || afterCanPlay
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
    setFsShowPlay(false)
    setAfterCanPlay(false) // reset; frameReady will come from posterUrl or canplay
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

  // ── First frame: seek after each load event ───────────────────────────────
  function logV(label, v) {
    pLog(`VideoModule [${label}] rs=${v.readyState} ns=${v.networkState} t=${v.currentTime.toFixed(3)} dur=${v.duration}`)
  }

  function handleMetadata(e) {
    const v = e.currentTarget
    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
    logV('onLoadedMetadata', v)
    // Skip seek if poster is available — seeking removes poster and causes black flash
    if (!posterUrl) {
      v.currentTime = 0.001
      pLog('VideoModule: seek→0.001 after metadata (no poster)')
    }
  }

  function handleLoadedData(e) {
    const v = e.currentTarget
    logV('onLoadedData', v)
    if (!posterUrl && v.currentTime < 0.0005) {
      v.currentTime = 0.001
      pLog('VideoModule: seek→0.001 after loadeddata (no poster)')
    }
  }

  function handleCanPlay(e) {
    const v = e.currentTarget
    logV('onCanPlay', v)
    if (!posterUrl && v.currentTime < 0.0005) {
      v.currentTime = 0.001
      pLog('VideoModule: seek→0.001 after canplay (no poster)')
    }
    pLog('VideoModule: afterCanPlay=true posterUrl=', !!posterUrl)
    setAfterCanPlay(true)
  }

  function handleSeeked(e) {
    logV('onSeeked', e.currentTarget)
    pLog('VideoModule: onSeeked → afterCanPlay=true')
    setAfterCanPlay(true)
  }

  function seekToFirstFrame(v) {
    const el = v ?? videoRef.current
    if (!el) return
    pLog('VideoModule: seekToFirstFrame t=', el.currentTime)
    el.currentTime = 0.001
  }

  // ── Inline playback ───────────────────────────────────────────────────────
  function playWithAudio() {
    const v = videoRef.current
    if (!v) return
    pLog('VideoModule: playWithAudio rs=', v.readyState, 'muted=', v.muted, 'paused=', v.paused)
    v.currentTime = 0
    v.muted = false
    const p = v.play()
    pLog('VideoModule: play() called, promise=', p ? 'yes' : 'no')
    p && p.then(() => {
      pLog('VideoModule: play() resolved OK muted=', v.muted)
    }).catch(err => {
      pLog('VideoModule: play() rejected:', err.name, err.message, '→ muted fallback')
      v.muted = true
      v.play().then(() => pLog('VideoModule: muted fallback play OK')).catch(e => pLog('VideoModule: muted fallback FAILED:', e.message))
    })
    setShowPlay(false)
  }

  function handleEnded() {
    pLog('VideoModule: INLINE ENDED — setShowPlay(true)')
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
      setFsShowPlay(false)
      fs.currentTime = 0
      fs.muted = false
      fs.play().catch(() => {
        fs.muted = true
        fs.play().catch(err => pLog('VideoModule FS play failed:', err.message))
      })
    }
    setFsVisible(true)
  }

  function handleFsEnded() {
    pLog('VideoModule: FS ended → show FS play btn')
    setFsShowPlay(true)
  }

  function handleFsPlayBtnTap() {
    const fs = fsVideoRef.current
    if (!fs) return
    fs.currentTime = 0
    fs.muted = false
    fs.play().catch(() => {
      fs.muted = true
      fs.play().catch(err => pLog('VideoModule FS replay failed:', err.message))
    })
    setFsShowPlay(false)
  }

  function closeFs() {
    fsVideoRef.current?.pause()
    setFsVisible(false)
    setFsShowPlay(false)
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
                  poster={posterUrl ?? undefined}
                  onLoadedMetadata={handleMetadata}
                  onLoadedData={handleLoadedData}
                  onCanPlay={handleCanPlay}
                  onSeeked={handleSeeked}
                  onEnded={handleEnded}
                  onError={e => pLog('VideoModule onError', e.currentTarget.error?.code)}
                />
                {/* Dark mask while first frame not yet decoded — fades out when ready */}
                {!frameReady && <div className="videoFrameMask" />}
                {showPlay && <PlayBtn />}
              </div>

              {fsVisible && <div className="videoFsBg" onClick={closeFs} />}

              {/* Always in DOM so play() is called synchronously inside gesture */}
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
                onEnded={handleFsEnded}
                onError={e => pLog('VideoModule FS onError', e.currentTarget.error?.code)}
              />

              {fsVisible && (
                <div className="videoFsControls" style={{ zIndex: 253 }}>
                  <button className="videoFullClose" onClick={closeFs}>×</button>
                  {!fsReady && <div className="videoFullSpinner" />}
                  {fsReady && fsShowPlay && (
                    <button className="videoFsPlayBtn" onClick={handleFsPlayBtnTap}>
                      <PlaySvg size={64} />
                    </button>
                  )}
                </div>
              )}
            </>
          : <div className="playerMediaPlaceholder">Видео не загружено</div>
        }
      </PlayerBubble>
    </div>
  )
}

// Inline play button — centered inside .playerVideoCropFrame via absolute positioning
function PlayBtn() {
  return (
    <div className="videoPlayBtn" aria-label="Воспроизвести">
      <PlaySvg size={48} />
    </div>
  )
}

// Raw SVG — used both for inline overlay and FS button
function PlaySvg({ size = 48 }) {
  const s = size
  const cx = s / 2, cy = s / 2, r = s / 2
  const tr = r * 0.42
  const pts = [
    [cx - tr * 0.6, cy - tr],
    [cx + tr,       cy      ],
    [cx - tr * 0.6, cy + tr ],
  ]
  const d = `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} L ${pts[2][0]} ${pts[2][1]} Z`
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.45)" />
      <path d={d} fill="white" stroke="white" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
