import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

export default function VideoModule({ node, file, onDone }) {
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [intrinsic,  setIntrinsic]  = useState(null)
  const [frameDims,  setFrameDims]  = useState(null)
  const [fsVisible,  setFsVisible]  = useState(false)
  const [fsReady,    setFsReady]    = useState(false)
  const videoRef  = useRef(null)
  const fsVideoRef = useRef(null)
  const frameRef  = useRef(null)

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

  // ── Inline playback ──────────────────────────────────────────────────────
  const doneFiredRef = useRef(false)

  function handleInlinePlay(e) {
    const v = e.currentTarget
    pLog('VideoModule onPlay — readyState=', v.readyState, 'muted=', v.muted, 'currentTime=', v.currentTime)
    if (!doneFiredRef.current) {
      // First play: unmute. iOS allows muted→unmuted on already-playing video.
      v.muted = false
    }
  }

  function handleInlineEnded() {
    if (!doneFiredRef.current) { doneFiredRef.current = true; onDone?.() }
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.loop  = true
    v.play()
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
  // fsVideoRef is always in DOM (hidden via CSS) so play() can be called
  // synchronously inside the user-gesture click handler.
  function openFs() {
    const inline = videoRef.current
    if (inline) inline.pause()
    const fs = fsVideoRef.current
    if (fs && src) {
      setFsReady(false)
      fs.currentTime = 0
      fs.muted = false
      // play() called synchronously in click handler = inside user gesture context
      fs.play().catch(() => {
        pLog('VideoModule FS play (unmuted) failed, retrying muted')
        fs.muted = true
        fs.play().catch(err => pLog('VideoModule FS play muted failed:', err.message))
      })
    }
    setFsVisible(true)
  }

  function closeFs() {
    const fs = fsVideoRef.current
    if (fs) fs.pause()
    setFsVisible(false)
    videoRef.current?.play()
  }

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              {/* ── Inline video ── */}
              <div ref={frameRef} className="playerVideoCropFrame" onClick={openFs}>
                <video
                  ref={videoRef}
                  src={src}
                  className="playerVideoMedia"
                  style={getMediaStyle()}
                  playsInline autoPlay muted preload="auto"
                  onPlay={handleInlinePlay}
                  onEnded={handleInlineEnded}
                  onLoadedMetadata={e => {
                    const v = e.currentTarget
                    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
                    pLog('VideoModule onLoadedMetadata — readyState=', v.readyState, 'duration=', v.duration)
                  }}
                  onError={e => pLog('VideoModule onError —', e.currentTarget.error?.code, e.currentTarget.error?.message)}
                />
              </div>

              {/* ── Fullscreen video — always in DOM so play() hits user-gesture window ── */}
              <video
                ref={fsVideoRef}
                src={src}
                className="videoFullPlayer"
                playsInline loop preload="none"
                style={{
                  position: 'fixed', inset: 0, zIndex: fsVisible ? 250 : -1,
                  opacity: fsVisible && fsReady ? 1 : 0,
                  pointerEvents: 'none',
                  width: '100%', height: '100%', objectFit: 'contain', background: '#000',
                }}
                onCanPlay={() => {
                  pLog('VideoModule FS onCanPlay — ready')
                  setFsReady(true)
                }}
                onError={e => pLog('VideoModule FS onError —', e.currentTarget.error?.code)}
              />

              {/* ── Fullscreen overlay (close button + spinner) ── */}
              {fsVisible && (
                <div className="videoFullOverlay" onClick={closeFs} style={{ zIndex: 251 }}>
                  <button
                    className="videoFullClose"
                    onClick={e => { e.stopPropagation(); closeFs() }}
                  >×</button>
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
