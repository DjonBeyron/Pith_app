import { useState, useEffect, useRef } from 'react'
import ReplyPreview from '../../ReplyPreview.jsx'

export default function StickerModule({ node, file, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
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
    const t = setTimeout(() => {
      animDoneRef.current = true
      tryPlay()
    }, 420)
    return () => clearTimeout(t)
  }, [isVideo, src]) // eslint-disable-line

  function handleCanPlay() {
    canPlayRef.current = true
    tryPlay()
  }

  const replyToSeq = node.typeData?.sticker?.replyToSeq
  const replyNode  = replyToSeq > 0 ? lessonNodes.find(n => n.seq === replyToSeq) : null

  const media = src
    ? (isVideo
      ? <video ref={videoRef} src={src} poster={poster} className="stickerMedia" loop playsInline muted preload="auto" onCanPlay={handleCanPlay} />
      : <img src={src} className="stickerMedia" alt="" />)
    : <div className="stickerPlaceholder">Стикер не загружен</div>

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
