import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

// Tap detection thresholds
const DBL_TAP_MS = 300 // two taps within this window = double tap

export default function VideoModule({ node, file, onDone }) {
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [intrinsic,  setIntrinsic]  = useState(null)
  const [frameDims,  setFrameDims]  = useState(null)
  const [fsVisible,  setFsVisible]  = useState(false)
  const [fsReady,    setFsReady]    = useState(false)
  const videoRef   = useRef(null)
  const fsVideoRef = useRef(null)
  const frameRef   = useRef(null)
  const tapTimerRef = useRef(null)
  const tapCountRef = useRef(0)

  const crop = node.typeData?.video?.crop ?? { x: 0, y: 0, scale: 1 }

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.video?.r2Url ?? null

  useEffect(() => {
    pLog('VideoModule src=', src ? (src.startsWith('blob:') ? 'blob:...' : src) : 'null',
      '| blobUrl=', file?.blobUrl ? 'YES' : 'no')
    setIntrinsic(null)
    doneFiredRef.current = false
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

  // ── Inline: muted autoloop, onDone near end of first play ────────────────
  const doneFiredRef = useRef(false)

  function handleTimeUpdate(e) {
    if (doneFiredRef.current) return
    const v = e.currentTarget
    if (v.duration && v.currentTime >= v.duration - 0.15) {
      doneFiredRef.current = true
      v.muted = true // ensure silent loop after first play
      pLog('VideoModule: first play ending → onDone()')
      onDone?.()
    }
  }

  // ── Tap handling: single = play with audio, double = fullscreen ──────────
  function handleTap() {
    tapCountRef.current += 1

    if (tapCountRef.current === 1) {
      tapTimerRef.current = setTimeout(() => {
        // Single tap confirmed — play inline with audio from start
        tapCountRef.current = 0
        const v = videoRef.current
        if (!v) return
        pLog('VideoModule: single tap → play with audio')
        v.pause()
        v.muted = false
        v.currentTime = 0
        v.play().catch(err => {
          pLog('VideoModule: tap play failed:', err.message, '→ muted fallback')
          v.muted = true
          v.play().catch(() => {})
        })
      }, DBL_TAP_MS)
    } else {
      // Double tap — cancel single-tap timer, open fullscreen
      clearTimeout(tapTimerRef.current)
      tapCountRef.current = 0
      pLog('VideoModule: double tap → fullscreen')
      openFs()
    }
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
  function openFs() {
    videoRef.current?.pause()
    const fs = fsVideoRef.current
    if (fs && src) {
      setFsReady(false)
      fs.currentTime = 0
      fs.muted = false
      fs.play().catch(() => {
        pLog('VideoModule: FS unmuted failed → muted fallback')
        fs.muted = true
        fs.play().catch(err => pLog('VideoModule: FS muted failed:', err.message))
      })
    }
    setFsVisible(true)
  }

  function closeFs() {
    fsVideoRef.current?.pause()
    setFsVisible(false)
    const v = videoRef.current
    if (v) { v.muted = true; v.play().catch(() => {}) }
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
                  playsInline autoPlay muted loop preload="auto"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={e => {
                    const v = e.currentTarget
                    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
                    pLog('VideoModule onLoadedMetadata — readyState=', v.readyState, 'duration=', v.duration)
                  }}
                  onError={e => pLog('VideoModule onError —', e.currentTarget.error?.code, e.currentTarget.error?.message)}
                />
              </div>

              {/* Fullscreen video always in DOM — play() in click handler = user gesture */}
              <video
                ref={fsVideoRef}
                src={src}
                className="videoFullPlayer"
                playsInline loop preload="none"
                style={{
                  position: 'fixed', inset: 0,
                  zIndex: fsVisible ? 250 : -1,
                  opacity: fsVisible && fsReady ? 1 : 0,
                  pointerEvents: 'none',
                  width: '100%', height: '100%', objectFit: 'contain', background: '#000',
                }}
                onCanPlay={() => { pLog('VideoModule FS ready'); setFsReady(true) }}
                onError={e => pLog('VideoModule FS onError —', e.currentTarget.error?.code)}
              />

              {fsVisible && (
                <div className="videoFullOverlay" onClick={closeFs} style={{ zIndex: 251 }}>
                  <button className="videoFullClose" onClick={e => { e.stopPropagation(); closeFs() }}>×</button>
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
