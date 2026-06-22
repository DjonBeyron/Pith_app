import { useState, useEffect, useRef } from 'react'

export default function StickerModule({ node, file, onDone }) {
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
  const isVideo = node.typeData?.sticker?.isVideo ?? false

  // Play when BOTH are ready: animation done (420ms) AND video has first frame (canPlay).
  // Whichever arrives later triggers actual playback.
  function tryPlay() {
    if (canPlayRef.current && animDoneRef.current) {
      videoRef.current?.play().catch(() => {})
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

  return (
    <div className="playerMsgRow">
      <div className="stickerWrap">
        {src
          ? (isVideo
            ? <video
                ref={videoRef}
                src={src}
                className="stickerMedia"
                loop
                playsInline
                muted
                preload="auto"
                onCanPlay={handleCanPlay}
              />
            : <img src={src} className="stickerMedia" alt="" />)
          : <div className="stickerPlaceholder">Стикер не загружен</div>
        }
      </div>
    </div>
  )
}
