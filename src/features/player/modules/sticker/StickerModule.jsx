import { useState, useEffect } from 'react'

export default function StickerModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)

  useEffect(() => { onDone?.() }, []) // eslint-disable-line

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src     = file?.r2Url ?? objectUrl
  const isVideo = node.typeData?.sticker?.isVideo ?? false
  const muted   = node.typeData?.sticker?.muted   ?? true

  return (
    <div className="playerMsgRow">
      <div className="stickerWrap">
        {src
          ? (isVideo
            ? <video src={src} className="stickerMedia" autoPlay loop playsInline muted={muted} />
            : <img   src={src} className="stickerMedia" alt="" />)
          : <div className="stickerPlaceholder">Стикер не загружен</div>
        }
      </div>
    </div>
  )
}
