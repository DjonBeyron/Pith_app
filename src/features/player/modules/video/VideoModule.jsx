import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { VolumeX } from 'lucide-react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'
import { usePlayedOffset, playedOffsetMs } from '../../usePlayedOffset.js'
import { useMissingMediaFallback } from '../../useMissingMediaFallback.js'
import { VIDEO_GUARD, VIDEO_GUARD_STYLE } from '../../../../shared/lib/videoHudGuard.js'
import { useWideScreen, useVideoMirror } from '../../videoMirror.js'
import { useVideoFullscreen } from './useVideoFullscreen.jsx'

export default function VideoModule({ node, file, onDone, videoAutoSound, adminPreview = false, pending = false }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intrinsic, setIntrinsic] = useState(null)
  const [frameDims, setFrameDims] = useState(null)
  const [frame0, setFrame0]       = useState(null)  // first frame captured at load, used as FS transition overlay
  const videoRef    = useRef(null)
  // canvas-зеркало кадров (десктоп): показывает картинку вместо самого <video>
  const mirrorRef   = useRef(null)
  const frameRef    = useRef(null)
  const doneFiredRef      = useRef(false)
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

  // Видео ещё не загружено, смотрит админ — держим сценарий живым
  useMissingMediaFallback(adminPreview && !src && !pending, onDone)

  useEffect(() => {
    pLog('VideoModule src=', src ? (src.startsWith('blob:') ? 'blob:...' : src) : 'null')
    // Сброс медиасостояния при смене src — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntrinsic(null)
    setFrame0(null)
    setMutedLoop(false)
    doneFiredRef.current = false
    firstPlayDoneRef.current = false
  }, [src])

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    setFrameDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  function fireDone() {
    if (doneFiredRef.current) return
    doneFiredRef.current = true
    pLog('VideoModule: onDone()')
    onDone?.()
  }

  // На десктопе кадры показывает canvas, а сам <video> прячется: иначе
  // Яндекс.Браузер вешает поверх видео свою панель (см. videoMirror.js)
  const mirror = useWideScreen()

  // Полноэкранный просмотр по тапу — useVideoFullscreen.jsx
  const { fsPortal, handleTap, fsVideoRef } = useVideoFullscreen({
    src, frame0, crop, intrinsic, frameDims, mirror, doneFiredRef, fireDone, frameRef, videoRef,
  })

  // Отрицательный офсет триггера played — следующая нода стартует до конца
  // видео; смотрим оба элемента, ролик может играть и в полном экране
  usePlayedOffset(
    playedOffsetMs(node),
    () => [videoRef.current, fsVideoRef.current],
    () => fireDone(),
  )

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

  useVideoMirror(videoRef, mirrorRef, mirror && !!src, frame0)

  function getMediaStyle() {
    if (!frameDims) return calcCropStyle(0, 0)
    return calcCropStyle(frameDims.w, frameDims.h)
  }

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              <div ref={frameRef} className="playerVideoCropFrame" onClick={handleTap}>
                <video
                  {...VIDEO_GUARD}
                  ref={videoRef} src={src}
                  className={`playerVideoMedia${mirror ? ' videoMirrorSource' : ''}`}
                  style={mirror ? VIDEO_GUARD_STYLE : { ...getMediaStyle(), ...VIDEO_GUARD_STYLE }}
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
                {mirror && (
                  <canvas ref={mirrorRef} className="playerVideoMedia" style={getMediaStyle()} aria-hidden="true" />
                )}
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
      <VolumeX size={14} color="white" />
    </div>
  )
}
