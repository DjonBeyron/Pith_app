import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

export default function VideoModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intrinsic, setIntrinsic] = useState(null)
  const [frameDims, setFrameDims] = useState(null)
  const [fsVisible, setFsVisible] = useState(false)
  const [fsSrc, setFsSrc]        = useState(null)
  const videoRef    = useRef(null)
  const fsVideoRef  = useRef(null)
  const frameRef    = useRef(null)
  const progressRef = useRef(null)
  const rafRef      = useRef(null)
  const doneFiredRef = useRef(false)
  const fsOpenRef   = useRef(false)
  const tapCooldown = useRef(false)

  const crop = node.typeData?.video?.crop ?? { x: 0, y: 0, scale: 1 }

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src    = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.video?.r2Url ?? null
  const poster = file?.posterUrl ?? undefined

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

  function calcCropStyle(fw, fh, cx, cy) {
    const ox = cx ?? crop.x
    const oy = cy ?? crop.y
    if (!intrinsic) return {
      width: '100%', height: '100%', objectFit: 'cover',
      transform: `translate(${ox}px,${oy}px) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
    const ma = intrinsic.w / intrinsic.h
    const fa = fw / fh
    const d = ma > fa ? { w: fh * ma, h: fh } : { w: fw, h: fw / ma }
    return {
      position: 'absolute', left: '50%', top: '50%',
      width: d.w + 'px', height: d.h + 'px',
      transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px)) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
  }

  function getMediaStyle() {
    if (!frameDims) return calcCropStyle(0, 0)
    return calcCropStyle(frameDims.w, frameDims.h)
  }

  function getFsMediaStyle() {
    if (!intrinsic || !frameDims) {
      return {
        position: 'absolute', inset: 0,
        width: '100%', height: '100%', objectFit: 'cover',
      }
    }
    const sw = window.innerWidth
    const sh = window.innerHeight
    const ma = intrinsic.w / intrinsic.h
    // Size the FS video element to cover the screen (same logic as calcCropStyle)
    const faFs = sw / sh
    const dFs = ma > faFs ? { w: sh * ma, h: sh } : { w: sw, h: sw / ma }
    // Size the inline video element (to get the correct scale ratio)
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

  function fireDone() {
    if (doneFiredRef.current) return
    doneFiredRef.current = true
    pLog('VideoModule: onDone()')
    onDone?.()
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

    pLog('VideoModule: handleTap → open FS, revisit=', doneFiredRef.current)
    setFsSrc(src)
    fsOpenRef.current = true
    setFsVisible(true)
  }

  // Когда fsSrc появился → воспроизвести
  useEffect(() => {
    if (!fsSrc) return
    const fs = fsVideoRef.current
    if (!fs) return
    if (progressRef.current) progressRef.current.style.width = '0%'
    fs.currentTime = 0
    fs.muted = false
    startRaf()
    fs.play().catch(() => {
      pLog('VideoModule: FS unmuted failed → muted')
      fs.muted = true
      fs.play().catch(err => pLog('VideoModule: FS muted failed:', err.message))
    })
  }, [fsSrc]) // eslint-disable-line

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
        <div className="videoFsBg" onClick={closeFs} style={{ zIndex: 251 }} />
      )}
      {/* Video container always in DOM so fsVideoRef is always attached */}
      <div style={{
        position: 'fixed', inset: 0,
        zIndex: fsVisible ? 252 : -1,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <video
          ref={fsVideoRef}
          src={fsSrc ?? undefined}
          poster={poster}
          playsInline
          preload="none"
          style={getFsMediaStyle()}
          onEnded={handleFsEnded}
          onError={e => pLog('VideoModule FS onError', e.currentTarget.error?.code)}
        />
      </div>
      {fsVisible && (
        <div className="videoFsControls" style={{ zIndex: 253 }}>
          <button className="videoFullClose" onClick={closeFs}>×</button>
          <div className="videoFsProgressTrack">
            <div ref={progressRef} className="videoFsProgressBar" style={{ width: '0%' }} />
          </div>
        </div>
      )}
      {fsVisible && (
        <div style={{
          position: 'fixed', top: 60, left: 8, zIndex: 300,
          background: 'rgba(0,0,0,0.75)', color: '#b6fe3b',
          fontSize: 10, lineHeight: 1.5, padding: '6px 8px',
          borderRadius: 6, fontFamily: 'monospace', maxWidth: 260,
          pointerEvents: 'none', whiteSpace: 'pre',
        }}>
          {(() => {
            const sw = window.innerWidth, sh = window.innerHeight
            const ma = intrinsic ? intrinsic.w / intrinsic.h : null
            const faFs = sw / sh
            const dFs = ma ? (ma > faFs ? { w: sh * ma, h: sh } : { w: sw, h: sw / ma }) : null
            const faIn = frameDims ? frameDims.w / frameDims.h : null
            const dIn = (ma && frameDims) ? (ma > faIn ? { w: frameDims.h * ma, h: frameDims.h } : { w: frameDims.w, h: frameDims.w / ma }) : null
            const sy = (dFs && dIn) ? (dFs.h / dIn.h).toFixed(3) : '—'
            const tyPx = (dFs && dIn) ? (crop.y * dFs.h / dIn.h).toFixed(1) : '—'
            return [
              `screen: ${sw}×${sh}`,
              `frameDims: ${frameDims ? `${frameDims.w}×${frameDims.h}` : 'null'}`,
              `intrinsic: ${intrinsic ? `${intrinsic.w}×${intrinsic.h}` : 'null'}`,
              `crop: x=${crop.x} y=${crop.y} s=${crop.scale}`,
              `dFs: ${dFs ? `${dFs.w.toFixed(0)}×${dFs.h.toFixed(0)}` : '—'}`,
              `dIn: ${dIn ? `${dIn.w.toFixed(0)}×${dIn.h.toFixed(0)}` : '—'}`,
              `sy: ${sy}  ty: ${tyPx}px`,
              `fsSrc: ${fsSrc ? 'set' : 'null'}`,
            ].join('\n')
          })()}
        </div>
      )}
    </>,
    document.body,
  )

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              <div ref={frameRef} className="playerVideoCropFrame" onClick={handleTap}>
                <video
                  ref={videoRef} src={src} poster={poster} className="playerVideoMedia"
                  style={{ ...getMediaStyle(), pointerEvents: 'none' }}
                  playsInline autoPlay muted loop preload="auto"
                  onLoadedMetadata={e => {
                    const v = e.currentTarget
                    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
                    pLog('VideoModule meta rs=', v.readyState)
                  }}
                  onError={e => pLog('VideoModule onError', e.currentTarget.error?.code)}
                />
                <MutedIcon />
              </div>
              {fsPortal}
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
