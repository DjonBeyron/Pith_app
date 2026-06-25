import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import ReplyPreview from '../../ReplyPreview.jsx'

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

export default function StickerModule({ node, file, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, onDone, videoAutoSound }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intrinsic, setIntrinsic] = useState(null)
  const [mutedLoop, setMutedLoop] = useState(false)
  const videoRef         = useRef(null)
  const canPlayRef       = useRef(false)
  const animDoneRef      = useRef(false)
  const firstPlayDoneRef = useRef(false)

  // onDone fires immediately unless videoAutoSound+isVideo (then after first play)
  useEffect(() => {
    const isVideo = node.typeData?.sticker?.isVideo ?? false
    if (!videoAutoSound || !isVideo) onDone?.()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src     = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.sticker?.r2Url ?? null
  const poster  = file?.posterUrl ?? undefined
  const isVideo = node.typeData?.sticker?.isVideo ?? false
  const crop    = node.typeData?.sticker?.crop ?? { x: 0, y: 0, scale: 1 }

  useEffect(() => {
    setIntrinsic(null)
    setMutedLoop(false)
    firstPlayDoneRef.current = false
  }, [src])

  // Normal (non-autoSound) video start: wait for slide-in animation + canPlay
  function tryPlay() {
    if (canPlayRef.current && animDoneRef.current) {
      const v = videoRef.current
      if (v) { v.muted = true; v.play().catch(() => {}) }
    }
  }

  useEffect(() => {
    if (!isVideo || !src || videoAutoSound) return
    canPlayRef.current  = false
    animDoneRef.current = false
    const t = setTimeout(() => { animDoneRef.current = true; tryPlay() }, 420)
    return () => clearTimeout(t)
  }, [isVideo, src]) // eslint-disable-line

  function handleCanPlay() {
    if (!videoAutoSound) { canPlayRef.current = true; tryPlay() }
  }

  function handleVideoMeta(e) {
    const v = e.target
    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
  }

  // videoAutoSound: onLoadedData — MutationObserver then unmuted play
  function handleVideoLoaded() {
    if (!videoAutoSound || firstPlayDoneRef.current) return
    const v = videoRef.current
    if (!v) return
    v.muted = false; v.loop = false

    function playAfterAnimation() {
      setTimeout(() => {
        if (firstPlayDoneRef.current) return
        v.play().catch(() => {
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

  function handleVideoEnded() {
    if (!videoAutoSound || firstPlayDoneRef.current) return
    firstPlayDoneRef.current = true
    onDone?.()
    const v = videoRef.current
    if (!v) return
    v.muted = true; v.loop = true; v.currentTime = 0
    v.play().catch(() => {}); setMutedLoop(true)
  }

  const mediaStyle = getStickerStyle(intrinsic, crop)

  const media = src
    ? (isVideo
      ? <video
          ref={videoRef}
          src={src}
          poster={poster}
          style={mediaStyle}
          playsInline preload="auto"
          autoPlay={!videoAutoSound}
          muted={!videoAutoSound}
          loop={!videoAutoSound && !mutedLoop}
          onCanPlay={handleCanPlay}
          onLoadedMetadata={handleVideoMeta}
          onLoadedData={videoAutoSound ? handleVideoLoaded : undefined}
          onEnded={videoAutoSound ? handleVideoEnded : undefined}
        />
      : <img
          src={src}
          alt=""
          style={mediaStyle}
          onLoad={e => setIntrinsic({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        />)
    : <div className="stickerPlaceholder">Стикер не загружен</div>

  const replyToSeq = node.typeData?.sticker?.replyToSeq
  const replyNode  = replyToSeq > 0 ? lessonNodes.find(n => n.seq === replyToSeq) : null

  return (
    <div className="playerMsgRow">
      {replyNode ? (
        <div className="stickerReplyWrap">
          <ReplyPreview
            replyNode={replyNode}
            lessonFiles={lessonFiles}
            teacherName={teacherName}
            allWordChoiceStates={allWordChoiceStates}
            allPhotoChoiceStates={allPhotoChoiceStates}
            allPhraseStates={allPhraseStates}
          />
          <div className="stickerWrap">{media}</div>
        </div>
      ) : (
        <div className="stickerWrap">{media}</div>
      )}
    </div>
  )
}
