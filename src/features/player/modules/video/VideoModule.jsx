import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { useMediaUnlock } from '../../MediaUnlockContext.js'
import { pLog } from '../../../../shared/lib/debug.js'

export default function VideoModule({ node, file, onDone }) {
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [intrinsic,  setIntrinsic]  = useState(null)
  const [frameDims,  setFrameDims]  = useState(null)
  const [fsVisible,  setFsVisible]  = useState(false)
  const [fsReady,    setFsReady]    = useState(false)
  const videoRef   = useRef(null)
  const fsVideoRef = useRef(null)
  const frameRef   = useRef(null)

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
    doneFiredRef.current = false // reset on src change
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

  // ── Audio unlock via gesture ─────────────────────────────────────────────
  // Register with LessonPlayer context. On first user tap anywhere on the
  // player, our callback fires in gesture context → play unmuted is allowed.
  const { registerForAudioUnlock } = useMediaUnlock() ?? {}
  const doneFiredRef = useRef(false)

  useEffect(() => {
    if (!src || !registerForAudioUnlock) return
    const cleanup = registerForAudioUnlock(() => {
      // Called synchronously inside iOS user gesture — audio allowed
      const v = videoRef.current
      if (!v || doneFiredRef.current) return
      pLog('VideoModule: gesture unlock → restart with audio')
      v.pause()
      v.muted = false
      v.currentTime = 0
      v.play().catch(err => {
        pLog('VideoModule: unlocked play failed:', err.message, '→ staying muted')
        v.muted = true
        v.play().catch(() => {})
      })
    })
    return cleanup
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Inline playback ──────────────────────────────────────────────────────
  // Plays muted in loop by default (iOS autoplay constraint).
  // Becomes unmuted when user gesture fires (see above).
  // onTimeUpdate: fire onDone() when first play nears end, then loop silently.
  function handleTimeUpdate(e) {
    if (doneFiredRef.current) return
    const v = e.currentTarget
    if (v.duration && v.currentTime >= v.duration - 0.15) {
      doneFiredRef.current = true
      if (!v.muted) v.muted = true // ensure silent loop after first play
      pLog('VideoModule: first play ending → onDone()')
      onDone?.()
    }
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
  // fsVideoRef always in DOM (hidden) so play() is synchronous in click handler
  // = inside iOS user-gesture context → audio allowed.
  function openFs() {
    videoRef.current?.pause()
    const fs = fsVideoRef.current
    if (fs && src) {
      setFsReady(false)
      fs.currentTime = 0
      fs.muted = false
      fs.play().catch(() => {
        pLog('VideoModule FS unmuted play failed, retrying muted')
        fs.muted = true
        fs.play().catch(err => pLog('VideoModule FS muted play failed:', err.message))
      })
    }
    setFsVisible(true)
  }

  function closeFs() {
    fsVideoRef.current?.pause()
    setFsVisible(false)
    videoRef.current?.play().catch(() => {})
  }

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              {/* ── Inline: muted loop, onDone via onTimeUpdate ── */}
              <div ref={frameRef} className="playerVideoCropFrame" onClick={openFs}>
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

              {/* ── Fullscreen: always in DOM, play() called in click handler ── */}
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

              {/* ── Fullscreen UI overlay ── */}
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
