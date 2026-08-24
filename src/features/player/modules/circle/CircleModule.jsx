import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { VolumeX } from 'lucide-react'
import { pLog } from '../../../../shared/lib/debug.js'
import { usePlayedOffset, playedOffsetMs } from '../../usePlayedOffset.js'
import { useMissingMediaFallback } from '../../useMissingMediaFallback.js'
import { VIDEO_GUARD, VIDEO_GUARD_STYLE } from '../../../../shared/lib/videoHudGuard.js'
import { useWideScreen, useVideoMirror } from '../../videoMirror.js'
import { useCircleExpand, getSmallPx } from './useCircleExpand.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R

function calcStyle(intrinsic, dims, crop) {
  if (!intrinsic || !dims) return {
    position: 'absolute', inset: 0, objectFit: 'cover',
    transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }
  const ma = intrinsic.w / intrinsic.h, fa = dims.w / dims.h
  const d = ma > fa ? { w: dims.h * ma, h: dims.h } : { w: dims.w, h: dims.w / ma }
  return {
    position: 'absolute', left: '50%', top: '50%',
    width: d.w + 'px', height: d.h + 'px',
    transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px)) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }
}

export default function CircleModule({ node, file, onDone, bottomOffset = 0, videoAutoSound, adminPreview = false, pending = false }) {
  const [objectUrl, setObjectUrl]   = useState(null)
  const [intr, setIntr]             = useState(null)
  const [dims, setDims]             = useState(null)
  const [mutedLoop, setMutedLoop]   = useState(false)  // videoAutoSound: true after first play

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }
  const isAndroid = /android/i.test(navigator.userAgent)

  // Отрицательный офсет триггера played — следующая нода стартует до конца кружка
  usePlayedOffset(playedOffsetMs(node), () => vRef.current, () => onDone?.())

  const vRef          = useRef(null)
  const mirrorRef     = useRef(null)   // canvas-зеркало кадров (десктоп)
  const wrapRef       = useRef(null)
  const frRef         = useRef(null)
  const arcRef        = useRef(null)
  const doneFiredRef      = useRef(false)
  const firstPlayDoneRef  = useRef(false)  // videoAutoSound: true after first unmuted play ends

  useEffect(() => {
    // Синхронный setState осознан: blob-URL живёт строго вместе с file.localFile
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src    = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.circle?.r2Url ?? null

  // Кружок ещё не загружен, смотрит админ — держим сценарий живым
  useMissingMediaFallback(adminPreview && !src && !pending, onDone)
  const poster = file?.posterUrl ?? undefined

  useEffect(() => {
    // Сброс медиасостояния при смене src — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntr(null)
    setMutedLoop(false)
    doneFiredRef.current = false
    firstPlayDoneRef.current = false
  }, [src])

  useLayoutEffect(() => {
    const el = frRef.current; if (!el) return
    setDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  function startRingAnimation(duration) {
    if (!arcRef.current) return
    arcRef.current.style.animation = `circleRingProgress ${duration}s linear forwards`
  }

  function stopRaf() {
    if (!arcRef.current) return
    arcRef.current.style.animation = 'none'
    arcRef.current.style.strokeDashoffset = String(RING_C)
  }

  // Раскрытие кружка на весь экран по тапу/свайпу — useCircleExpand.js
  const { expanded, collapsing, expandTransform, expandedRef, handleTap, collapse, onTouchStart, onTouchEnd } =
    useCircleExpand({ wrapRef, vRef, dims, bottomOffset, doneFiredRef, stopRaf, onDone })

  // videoAutoSound: called on onLoadedData — sets up MutationObserver then unmuted play
  function handleCircleLoaded() {
    if (!videoAutoSound || firstPlayDoneRef.current) return
    const v = vRef.current
    if (!v) return
    // vRef — обычный DOM-ref видео, мутация .current-свойств тут безопасна
    // (ref для этого и существует); компилятор осторожничает из-за передачи
    // vRef в useCircleExpand выше
    // eslint-disable-next-line react-hooks/immutability
    v.muted = false
    v.loop  = false

    function playAfterAnimation() {
      setTimeout(() => {
        if (firstPlayDoneRef.current) return
        pLog('[circle] autoSound — play unmuted after animation')
        v.play().catch(() => {
          pLog('[circle] autoSound unmuted failed → muted fallback')
          v.muted = true; v.loop = true
          v.play().catch(() => {})
          firstPlayDoneRef.current = true
          setMutedLoop(true)
          onDone?.()
        })
      }, 200)
    }

    const pendingWrapper = v.closest('[data-pending]')
    if (!pendingWrapper) {
      playAfterAnimation()
    } else {
      const observer = new MutationObserver(() => {
        if (!pendingWrapper.hasAttribute('data-pending')) {
          observer.disconnect()
          pLog('[circle] autoSound — pending removed, starting countdown')
          playAfterAnimation()
        }
      })
      observer.observe(pendingWrapper, { attributes: true, attributeFilter: ['data-pending'] })
    }
  }

  function handleEnded() {
    // videoAutoSound: first inline unmuted play ended → switch to muted loop
    if (videoAutoSound && !firstPlayDoneRef.current && !expandedRef.current) {
      firstPlayDoneRef.current = true
      pLog('[circle] autoSound — first play ended → muted loop')
      onDone?.()
      const v = vRef.current
      if (!v) return
      // eslint-disable-next-line react-hooks/immutability
      v.muted = true; v.loop = true
      v.currentTime = 0
      v.play().catch(() => {})
      setMutedLoop(true)
      return
    }
    if (!expandedRef.current) return
    if (doneFiredRef.current) {
      const v = vRef.current
      const arc = arcRef.current
      if (v) v.currentTime = 0
      if (arc) {
        arc.style.animation = 'none'
        arc.style.transition = 'stroke-dashoffset 0.3s ease'
        arc.style.strokeDashoffset = String(RING_C)
      }
      setTimeout(() => {
        if (!expandedRef.current) return
        if (arc) arc.style.transition = ''
        if (v) v.play().catch(() => {})
      }, 350)
      return
    }
    doneFiredRef.current = true
    if (arcRef.current) {
      arcRef.current.style.animation = 'none'
      arcRef.current.style.strokeDashoffset = '0'
    }
    onDone?.()
    collapse()
  }

  function handlePlaying() {
    if (!expandedRef.current) return
    const v = vRef.current
    if (v?.duration) startRingAnimation(v.duration - v.currentTime)
  }

  const s = dims?.w ?? getSmallPx()
  const wrapStyle = {
    width: s + 'px',
    height: s + 'px',
    ...(expanded ? { transform: expandTransform ?? undefined, zIndex: 10 } : {}),
    ...(collapsing && !expanded ? { zIndex: 10 } : {}),
  }

  const videoStyle = calcStyle(intr, dims, crop)
  // На десктопе кадры показывает canvas, а сам <video> прячется: иначе
  // Яндекс.Браузер вешает поверх кружка свою панель (см. videoMirror.js)
  const mirror = useWideScreen()
  useVideoMirror(vRef, mirrorRef, mirror && !!src, poster)

  return (
    <div className="playerMsgRow playerMsgRowCircle">
      {expanded && (
        <div className="circleBackdrop" onClick={collapse} />
      )}
      <div className={`playerMsgBubble playerMsgBubble--circle${(expanded || collapsing) ? ' playerMsgBubble--circle--expanded' : ''}`}>
        {src ? (
          <div
            ref={wrapRef}
            className="circleWrap"
            style={wrapStyle}
            onClick={handleTap}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div ref={frRef} className="circleFrame"
              style={isAndroid && poster ? { backgroundImage: `url(${poster})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            >
              <video
                {...VIDEO_GUARD}
                ref={vRef} src={src} poster={poster}
                className={`circleMedia${mirror ? ' videoMirrorSource' : ''}`}
                style={mirror ? VIDEO_GUARD_STYLE : { ...videoStyle, ...VIDEO_GUARD_STYLE }}
                playsInline preload="auto"
                autoPlay={!videoAutoSound}
                muted={!videoAutoSound}
                loop={!videoAutoSound}
                onLoadedMetadata={e => {
                  const v = e.currentTarget
                  setIntr({ w: v.videoWidth, h: v.videoHeight })
                }}
                onLoadedData={videoAutoSound ? handleCircleLoaded : undefined}
                onPlaying={handlePlaying}
                onEnded={handleEnded}
              />
              {mirror && (
                <canvas ref={mirrorRef} className="circleMedia" style={videoStyle} aria-hidden="true" />
              )}
            </div>

            <svg className="circleRingSvg" viewBox="0 0 218 218" aria-hidden="true"
              style={{
                opacity: (expanded && !collapsing) ? 1 : 0,
                transition: 'opacity 0.15s ease',
                transitionDelay: (expanded && !collapsing) ? '0.12s' : '0s',
              }}>
              <circle cx="109" cy="109" r={RING_R} fill="none"
                stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
              <circle ref={arcRef} cx="109" cy="109" r={RING_R} fill="none"
                stroke="#b6fe3b" strokeWidth="1.5" strokeLinecap="round"
                strokeDasharray={`${RING_C} 9999`} strokeDashoffset={String(RING_C)}
                transform="rotate(-90 109 109)"
              />
            </svg>

            <div className="circleMutedIcon" style={{
              opacity: (!expanded && !collapsing && (!videoAutoSound || mutedLoop)) ? 1 : 0,
              transition: (!expanded && !collapsing) ? 'opacity 0.2s ease 0.1s' : 'opacity 0s',
              pointerEvents: 'none',
            }}>
              <VolumeX size={14} color="white" />
            </div>
          </div>
        ) : <div className="playerMediaPlaceholder">Видеосообщение не загружено</div>}
      </div>
    </div>
  )
}
