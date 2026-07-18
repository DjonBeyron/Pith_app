import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

export default function VideoModule({ node, file, onDone, videoAutoSound }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intrinsic, setIntrinsic] = useState(null)
  const [frameDims, setFrameDims] = useState(null)
  const [frame0, setFrame0]       = useState(null)  // first frame captured at load, used as FS transition overlay
  const [fsVisible, setFsVisible] = useState(false)
  const [fsSrc, setFsSrc]         = useState(null)
  const [fsReady, setFsReady]     = useState(false)
  const videoRef    = useRef(null)
  const fsVideoRef  = useRef(null)
  const frameRef    = useRef(null)
  const progressRef = useRef(null)
  const rafRef      = useRef(null)
  const doneFiredRef      = useRef(false)
  const fsOpenRef         = useRef(false)
  const tapCooldown       = useRef(false)
  const firstPlayDoneRef  = useRef(false)  // videoAutoSound: true after first unmuted play ends
  const [mutedLoop, setMutedLoop] = useState(false)

  const crop = node.typeData?.video?.crop ?? { x: 0, y: 0, scale: 1 }

  useEffect(() => {
    // Синхронный setState осознан: blob-URL живёт строго вместе с file.localFile
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.video?.r2Url ?? null

  useEffect(() => {
    pLog('VideoModule src=', src ? (src.startsWith('blob:') ? 'blob:...' : src) : 'null')
    // Сброс медиасостояния при смене src — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntrinsic(null)
    setFrame0(null)
    setMutedLoop(false)
    doneFiredRef.current = false
    firstPlayDoneRef.current = false
    if (progressRef.current) progressRef.current.style.width = '0%'
  }, [src])

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    setFrameDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  // Capture frame 0 from the inline video right after first data loads (currentTime≈0).
  // Used as the FS overlay during the ~90ms gap before the FS video is ready.
  function captureFrame0(videoEl) {
    if (!videoEl || !videoEl.videoWidth) return
    try {
      const c = document.createElement('canvas')
      c.width = videoEl.videoWidth
      c.height = videoEl.videoHeight
      c.getContext('2d').drawImage(videoEl, 0, 0)
      const dataUrl = c.toDataURL('image/jpeg', 0.85)
      pLog('VideoModule: frame0 captured', videoEl.videoWidth + 'x' + videoEl.videoHeight)
      setFrame0(dataUrl)
    } catch (e) {
      pLog('VideoModule: frame0 capture failed', e.message)
    }
  }

  // videoAutoSound mode: play unmuted once, then muted loop
  function handleInlineLoaded(e) {
    captureFrame0(e.currentTarget)
    if (!videoAutoSound || firstPlayDoneRef.current) return
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.loop  = false

    function playAfterAnimation() {
      // 200ms after node becomes visible — slide-in animation (190ms) is done
      setTimeout(() => {
        if (firstPlayDoneRef.current) return
        pLog('VideoModule: autoSound — play unmuted after animation')
        v.play().catch(() => {
          pLog('VideoModule: autoSound unmuted failed → muted fallback')
          v.muted = true; v.loop = true
          v.play().catch(() => {})
          firstPlayDoneRef.current = true
          setMutedLoop(true)
          fireDone()
        })
      }, 200)
    }

    // Video may be preloaded while still pending (off-screen).
    // Wait for data-pending removal before starting animation countdown.
    const pendingWrapper = v.closest('[data-pending]')
    if (!pendingWrapper) {
      playAfterAnimation()
    } else {
      const observer = new MutationObserver(() => {
        if (!pendingWrapper.hasAttribute('data-pending')) {
          observer.disconnect()
          pLog('VideoModule: autoSound — pending removed, starting countdown')
          playAfterAnimation()
        }
      })
      observer.observe(pendingWrapper, { attributes: true, attributeFilter: ['data-pending'] })
    }
  }

  function handleInlineEnded() {
    if (!videoAutoSound || firstPlayDoneRef.current) return
    firstPlayDoneRef.current = true
    pLog('VideoModule: autoSound — first play ended → muted loop')
    fireDone()
    const v = videoRef.current
    if (!v) return
    v.muted = true; v.loop = true
    v.currentTime = 0
    v.play().catch(() => {})
    setMutedLoop(true)
  }

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

    pLog('VideoModule: tap → open FS revisit=', doneFiredRef.current,
      'frame0=', frame0 ? 'yes' : 'no')
    setFsReady(false)
    setFsSrc(src)
    fsOpenRef.current = true
    setFsVisible(true)
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
          ref={fsVideoRef}
          src={fsSrc ?? undefined}
          playsInline
          preload="none"
          style={getFsMediaStyle()}
          onCanPlay={handleFsCanPlay}
          onPlaying={() => pLog('VideoModule: FS onPlaying')}
          onWaiting={() => pLog('VideoModule: FS onWaiting')}
          onEnded={handleFsEnded}
          onError={e => pLog('VideoModule: FS onError code=', e.currentTarget.error?.code)}
        />
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

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              <div ref={frameRef} className="playerVideoCropFrame" onClick={handleTap}>
                <video
                  ref={videoRef} src={src} className="playerVideoMedia"
                  style={{ ...getMediaStyle(), pointerEvents: 'none' }}
                  playsInline preload="auto"
                  autoPlay={!videoAutoSound}
                  muted={!videoAutoSound}
                  loop={!videoAutoSound}
                  onLoadedMetadata={e => {
                    const v = e.currentTarget
                    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
                    pLog('VideoModule: inline meta w=', v.videoWidth, 'h=', v.videoHeight)
                  }}
                  onLoadedData={videoAutoSound ? handleInlineLoaded : e => captureFrame0(e.currentTarget)}
                  onEnded={videoAutoSound ? handleInlineEnded : undefined}
                  onError={e => pLog('VideoModule: inline onError code=', e.currentTarget.error?.code)}
                />
                {(!videoAutoSound || mutedLoop) && <MutedIcon />}
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
