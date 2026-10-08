import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { VolumeX } from 'lucide-react'
import { pLog } from '../../../../shared/lib/debug.js'
import { usePlayedOffset, playedOffsetMs } from '../../usePlayedOffset.js'
import { useMissingMediaFallback } from '../../useMissingMediaFallback.js'
import { VIDEO_GUARD, VIDEO_GUARD_STYLE } from '../../../../shared/lib/videoHudGuard.js'
import { useWideScreen, useVideoMirror } from '../../videoMirror.js'
import { useFirstFrame } from '../../useFirstFrame.js'
import { useCircleExpand, getSmallPx } from './useCircleExpand.js'
import { useCircleLoopPause } from './useCircleLoopPause.js'
import { getLessonMuted } from '../../lessonVolume.js'
import { useVideoGlowSource } from '../../useVideoGlowSource.js'
import { circleFit } from './circleFit.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R

export default function CircleModule({ node, file, onDone, bottomOffset = 0, videoAutoSound, adminPreview = false, pending = false }) {
  const [objectUrl, setObjectUrl]   = useState(null)
  const [intr, setIntr]             = useState(null)
  const [posterSize, setPosterSize] = useState(null)  // naturalWidth/Height стоп-кадра
  const [dims, setDims]             = useState(null)
  const [mutedLoop, setMutedLoop]   = useState(false)  // videoAutoSound: true after first play

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }

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

  // Как у голосового (useAudioSource.js): после первого кадра источник
  // фиксируется — подмена прямая ссылка → blob прогрева во время игры
  // перезагружала элемент (пустой кадр, рассинхрон звука и картинки)
  const [loadedSrc, setLoadedSrc] = useState(null)
  const rawSrc = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.circle?.r2Url ?? null
  const src    = loadedSrc ?? rawSrc

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

  // Беззвучный цикл кружка вне экрана — на паузу (useCircleLoopPause.js)
  useCircleLoopPause(wrapRef, vRef, !!src)

  // Раскрытие кружка на весь экран по тапу/свайпу — useCircleExpand.js
  const { expanded, collapsing, expandTransform, expandedRef, handleTap, collapse, onTouchStart, onTouchEnd } =
    useCircleExpand({ wrapRef, vRef, dims, bottomOffset, doneFiredRef, stopRaf, onDone })
  // Звук кружка → свечение снизу чата (первый проход videoAutoSound или раскрыт тапом; немая петля не светит)
  useVideoGlowSource(vRef, src, () => (videoAutoSound && !firstPlayDoneRef.current && !node.isHistory) || !!expandedRef.current)

  // videoAutoSound: called on onLoadedData — sets up MutationObserver then unmuted play
  function handleCircleLoaded() {
    // Восстановленная история («Продолжить урок») — повторный автозапуск не нужен
    if (!videoAutoSound || firstPlayDoneRef.current || node.isHistory) return
    const v = vRef.current
    if (!v) return
    // vRef — обычный DOM-ref видео, мутация .current-свойств тут безопасна
    // (ref для этого и существует); компилятор осторожничает из-за передачи
    // vRef в useCircleExpand выше
    // eslint-disable-next-line react-hooks/immutability
    v.muted = getLessonMuted() // «без звука» в шапке урока — первый проход немой
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

  // Видео и стоп-кадр — одна функция геометрии (circleFit.js). Размер кадра у
  // видео — из его метаданных, у постера — свой naturalWidth/Height (постер
  // снят в размере кадра), чтобы стоп-кадр не ждал loadedmetadata
  const videoStyle = circleFit({ box: dims, mediaW: intr?.w, mediaH: intr?.h, crop })
  const posterStyle = circleFit({ box: dims, mediaW: posterSize?.w ?? intr?.w, mediaH: posterSize?.h ?? intr?.h, crop })
  // На десктопе кадры показывает canvas, а сам <video> прячется: иначе
  // Яндекс.Браузер вешает поверх кружка свою панель (см. videoMirror.js)
  const mirror = useWideScreen()
  // Зеркало сообщает, когда в canvas легла настоящая (не чёрная) картинка:
  // до этого без постера держим скелетон, а не пустой тёмный круг (Android)
  const [mirrorSrc, setMirrorSrc] = useState(null)
  useVideoMirror(vRef, mirrorRef, mirror && !!src, null, () => setMirrorSrc(src))
  // Стоп-кадр везде — своя <img> с геометрией кадра (posterStyle) поверх видео/
  // canvas, пока видео не показало кадр (iPhone: useFirstFrame, Android:
  // зеркало нарисовало настоящий кадр). Ни UA-poster (iOS рисует иначе), ни
  // CSS-фон (был без кропа ноды — кадр «прыгал» при замене canvas), ни
  // постер в canvas: canvas хранит только живые кадры
  const framed = useFirstFrame(vRef, src)
  const showPosterImg = !!poster && (mirror ? mirrorSrc !== src : !framed)
  const showSkeleton = !poster && !(mirror ? mirrorSrc === src : loadedSrc)

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
            <div ref={frRef} className="circleFrame">
              {/* Ни постера, ни первого кадра — тот же скелетон с бликом, что и
                  без src: иначе до декодирования круг стоял пустым */}
              {showSkeleton && <div className="feedSkeleton" />}
              <video
                {...VIDEO_GUARD}
                ref={vRef} src={src}
                className={`circleMedia${mirror ? ' videoMirrorSource' : ''}`}
                style={mirror ? VIDEO_GUARD_STYLE : { ...videoStyle, ...VIDEO_GUARD_STYLE }}
                playsInline preload="auto"
                autoPlay={!videoAutoSound && !node.isHistory}
                muted={!videoAutoSound}
                loop={!videoAutoSound}
                onLoadedMetadata={e => {
                  const v = e.currentTarget
                  setIntr({ w: v.videoWidth, h: v.videoHeight })
                }}
                onLoadedData={e => {
                  const v = e.currentTarget
                  if (v.getAttribute('src')) setLoadedSrc(v.getAttribute('src'))
                  if (videoAutoSound) handleCircleLoaded()
                }}
                onError={() => setLoadedSrc(null)}
                onPlaying={handlePlaying}
                onEnded={handleEnded}
              />
              {mirror && (
                <canvas ref={mirrorRef} className="circleMedia" style={intr ? videoStyle : posterStyle} aria-hidden="true" />
              )}
              {showPosterImg && (
                <img src={poster} alt="" draggable={false} className="circleMedia"
                  onLoad={e => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                    setPosterSize({ w, h })
                    // Постер снят с кадра видео — пропорции обязаны совпасть
                    if (intr && w && h && Math.abs(w / h - intr.w / intr.h) > 0.01) {
                      pLog(`[circle] пропорции постера ${w}x${h} ≠ видео ${intr.w}x${intr.h}`)
                    }
                  }}
                  style={{ ...posterStyle, ...VIDEO_GUARD_STYLE }} />
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
        ) : (
          // Заглушка держит ту же круглую форму и тот же размер, что и
          // загруженный кружок (см. wrapStyle выше) — иначе разметка прыгает,
          // когда видео наконец подгружается. feedSkeleton — общий для ленты
          // скелетон с бегущим бликом (feed-media.css), circleFrame его же
          // обрезает в круг через overflow:hidden.
          <div className="circleWrap" style={wrapStyle}>
            <div className="circleFrame">
              <div className="feedSkeleton" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
