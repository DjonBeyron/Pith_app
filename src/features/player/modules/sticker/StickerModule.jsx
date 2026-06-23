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

export default function StickerModule({ node, file, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intrinsic, setIntrinsic] = useState(null)
  const videoRef    = useRef(null)
  const canPlayRef  = useRef(false)
  const animDoneRef = useRef(false)

  useEffect(() => { onDone?.() }, []) // eslint-disable-line

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

  useEffect(() => { setIntrinsic(null) }, [src])

  function tryPlay() {
    if (canPlayRef.current && animDoneRef.current) {
      const v = videoRef.current
      if (v) { v.muted = true; v.play().catch(() => {}) }
    }
  }

  useEffect(() => {
    if (!isVideo || !src) return
    canPlayRef.current  = false
    animDoneRef.current = false
    const t = setTimeout(() => { animDoneRef.current = true; tryPlay() }, 420)
    return () => clearTimeout(t)
  }, [isVideo, src]) // eslint-disable-line

  function handleCanPlay() { canPlayRef.current = true; tryPlay() }

  function handleVideoMeta(e) {
    const v = e.target
    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
  }

  const mediaStyle = getStickerStyle(intrinsic, crop)

  const media = src
    ? (isVideo
      ? <video
          ref={videoRef}
          src={src}
          poster={poster}
          style={mediaStyle}
          loop playsInline muted preload="auto"
          onCanPlay={handleCanPlay}
          onLoadedMetadata={handleVideoMeta}
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
