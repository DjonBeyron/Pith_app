import { useState, useEffect, useRef } from 'react'
import { VolumeX } from 'lucide-react'
import ReplyPreview from '../../ReplyPreview.jsx'
import HighlightedText from '../../../../shared/ui/HighlightedText.jsx'
import { useMissingMediaFallback } from '../../useMissingMediaFallback.js'
import { VIDEO_GUARD, VIDEO_GUARD_STYLE } from '../../../../shared/lib/videoHudGuard.js'
import { useWideScreen, useVideoMirror } from '../../videoMirror.js'

// Canvas sticker crop is set in a 200×200 frame; player stickerWrap is 160×160
const CROP_K = 160 / 200  // 0.8

function getStickerStyle(intrinsic, crop) {
  const scaledX = crop.x * CROP_K
  const scaledY = crop.y * CROP_K
  if (!intrinsic) return {
    width: '100%', height: '100%', objectFit: 'cover',
    transform: `translate(${scaledX}px,${scaledY}px) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }
  // intrinsic path — same as PhotoModule / VideoModule
  const ma = intrinsic.w / intrinsic.h
  const d = ma > 1 ? { w: 160 * ma, h: 160 } : { w: 160, h: 160 / ma }
  return {
    position: 'absolute', left: '50%', top: '50%',
    width: d.w + 'px', height: d.h + 'px',
    transform: `translate(calc(-50% + ${scaledX}px), calc(-50% + ${scaledY}px)) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }
}

export default function StickerModule({ node, file, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, onDone, videoAutoSound, adminPreview = false, pending = false }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intrinsic, setIntrinsic] = useState(null)
  const [mutedLoop, setMutedLoop] = useState(false)
  const [soundOn,   setSoundOn]   = useState(false)  // звук сейчас слышен (для иконки)
  const videoRef         = useRef(null)
  const mirrorRef        = useRef(null)   // canvas-зеркало кадров (десктоп)
  const canPlayRef       = useRef(false)
  const animDoneRef      = useRef(false)
  const firstPlayDoneRef = useRef(false)

  // Галочка «Со звуком» на самой ноде; не задана — как в настройках урока
  const autoSound = node.typeData?.sticker?.autoSound ?? videoAutoSound

  useEffect(() => {
    // Синхронный setState осознан: blob-URL живёт строго вместе с file.localFile
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src     = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.sticker?.r2Url ?? null

  // Стикер со звуком ждёт конца первого проигрывания — без файла этого не
  // случится, поэтому админу отпускаем цепочку по таймеру
  useMissingMediaFallback(adminPreview && !src && !pending, onDone)
  const poster  = file?.posterUrl ?? undefined
  const isVideo = node.typeData?.sticker?.isVideo ?? false
  const crop    = node.typeData?.sticker?.crop ?? { x: 0, y: 0, scale: 1 }

  // Триггер «Воспроизведено до конца» у стикера: ждём, пока ролик доиграет
  // первый раз. Стикер играет сам, без тапа — в отличие от видео, которое
  // пользователь открывает вручную. Ждём и при включённом звуке (первый
  // проход со звуком), и когда автор повесил переход на «доиграло».
  const wantsPlayed = (node.triggers ?? []).some(t => t.if === 'played' && t.then)
  const waitPlay = isVideo && (autoSound || wantsPlayed)

  // Картинка и стикер без ожидания отпускают цепочку сразу, как раньше
  useEffect(() => {
    if (!waitPlay) onDone?.()
  }, []) // eslint-disable-line

  useEffect(() => {
    // Сброс медиасостояния при смене src — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntrinsic(null)
    setMutedLoop(false)
    setSoundOn(false)
    firstPlayDoneRef.current = false
  }, [src])

  // Тап по стикеру — включить/выключить звук. Петля не прерывается: меняем
  // только muted, поэтому звук можно вернуть и снова убрать сколько угодно раз.
  function toggleSound() {
    const v = videoRef.current
    if (!isVideo || !v) return
    const turnOn = v.muted
    v.muted = !turnOn
    setSoundOn(turnOn)
    if (turnOn) v.play().catch(() => {})
  }

  // Normal (non-autoSound) video start: wait for slide-in animation + canPlay
  function tryPlay() {
    if (canPlayRef.current && animDoneRef.current) {
      const v = videoRef.current
      if (v) { v.muted = true; v.play().catch(() => {}) }
    }
  }

  useEffect(() => {
    if (!isVideo || !src || autoSound) return
    canPlayRef.current  = false
    animDoneRef.current = false
    const t = setTimeout(() => { animDoneRef.current = true; tryPlay() }, 420)
    return () => clearTimeout(t)
  }, [isVideo, src]) // eslint-disable-line

  function handleCanPlay() {
    if (!autoSound) { canPlayRef.current = true; tryPlay() }
  }

  function handleVideoMeta(e) {
    const v = e.target
    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
  }

  // autoSound: onLoadedData — MutationObserver then unmuted play
  function handleVideoLoaded() {
    if (!autoSound || firstPlayDoneRef.current) return
    const v = videoRef.current
    if (!v) return
    v.muted = false; v.loop = false

    function playAfterAnimation() {
      setTimeout(() => {
        if (firstPlayDoneRef.current) return
        v.play().then(() => setSoundOn(true)).catch(() => {
          v.muted = true; v.loop = true; v.play().catch(() => {})
          firstPlayDoneRef.current = true; setMutedLoop(true); onDone?.()
        })
      }, 200)
    }

    const pendingWrapper = v.closest('[data-pending]')
    if (!pendingWrapper) {
      playAfterAnimation()
    } else {
      const obs = new MutationObserver(() => {
        if (!pendingWrapper.hasAttribute('data-pending')) {
          obs.disconnect(); playAfterAnimation()
        }
      })
      obs.observe(pendingWrapper, { attributes: true, attributeFilter: ['data-pending'] })
    }
  }

  // Первый проход доиграл → отпускаем цепочку и уходим в беззвучную петлю
  // (если звук был — он выключается, вернуть можно тапом по стикеру)
  function handleVideoEnded() {
    if (!waitPlay || firstPlayDoneRef.current) return
    firstPlayDoneRef.current = true
    onDone?.()
    const v = videoRef.current
    if (!v) return
    v.muted = true; v.loop = true; v.currentTime = 0
    v.play().catch(() => {}); setMutedLoop(true); setSoundOn(false)
  }

  const mediaStyle = getStickerStyle(intrinsic, crop)

  // На десктопе кадры показывает canvas, а сам <video> прячется (videoMirror.js)
  const mirror = useWideScreen()
  useVideoMirror(videoRef, mirrorRef, mirror && isVideo && !!src, poster)

  const media = src
    ? (isVideo
      ? <>
        <video
          {...VIDEO_GUARD}
          ref={videoRef}
          src={src}
          poster={poster}
          className={mirror ? 'videoMirrorSource' : undefined}
          style={mirror ? VIDEO_GUARD_STYLE : { ...mediaStyle, ...VIDEO_GUARD_STYLE }}
          playsInline preload="auto"
          autoPlay={!autoSound}
          muted={!autoSound}
          /* пока ждём «доиграло» — крутить нельзя, иначе конца не наступит */
          loop={waitPlay ? mutedLoop : true}
          onCanPlay={handleCanPlay}
          onLoadedMetadata={handleVideoMeta}
          onLoadedData={autoSound ? handleVideoLoaded : undefined}
          onEnded={waitPlay ? handleVideoEnded : undefined}
        />
        {mirror && <canvas ref={mirrorRef} style={mediaStyle} aria-hidden="true" />}
        </>
      : <img
          src={src}
          alt=""
          style={mediaStyle}
          onLoad={e => setIntrinsic({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        />)
    : <div className="stickerPlaceholder">Стикер не загружен</div>

  const replyToSeq = node.typeData?.sticker?.replyToSeq
  const replyNode  = replyToSeq > 0 ? lessonNodes.find(n => n.seq === replyToSeq) : null
  // Рисуем подпись как есть: выделения хранятся позициями в исходной строке,
  // и обрезка пробелов сдвинула бы их. trim только решает, показывать ли блок.
  const captionRaw = node.typeData?.sticker?.caption ?? ''
  const caption    = captionRaw.trim()

  // Ответ и/или подпись — стикер и текст живут в одном пузыре, как одно
  // сообщение. Без них стикер остаётся «голым», без фона.
  const boxed = !!replyNode || !!caption

  // Иконка — только пока звук слышен, как кнопка «выключить». Обратной
  // индикации нет: молчащий стикер ничем не помечен.
  const stickerBox = (
    <div
      className={`stickerWrap${isVideo ? ' stickerWrapTappable' : ''}`}
      onClick={isVideo ? toggleSound : undefined}
    >
      {media}
      {isVideo && src && (
        <div className="stickerMutedIcon" style={{ opacity: soundOn ? 1 : 0 }}>
          <VolumeX size={13} color="white" />
        </div>
      )}
    </div>
  )

  return (
    <div className="playerMsgRow">
      {boxed ? (
        <div className={`stickerBubble${replyNode ? ' stickerBubbleReply' : ''}`}>
          {replyNode && (
            <ReplyPreview
              replyNode={replyNode}
              lessonFiles={lessonFiles}
              teacherName={teacherName}
              allWordChoiceStates={allWordChoiceStates}
              allPhotoChoiceStates={allPhotoChoiceStates}
              allPhraseStates={allPhraseStates}
            />
          )}
          {stickerBox}
          {caption && (
            <div className="stickerCaption">
              <HighlightedText text={captionRaw} highlights={node.typeData?.sticker?.highlights ?? []} />
            </div>
          )}
        </div>
      ) : stickerBox}
    </div>
  )
}
