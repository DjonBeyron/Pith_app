import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'

export default function PhotoModule({ node, file, onDone }) {
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [intrinsic,  setIntrinsic]  = useState(null)
  const [frameDims,  setFrameDims]  = useState(null)
  const [imgReady,   setImgReady]   = useState(false)
  const frameRef = useRef(null)

  const crop = node.typeData?.photo?.crop ?? { x: 0, y: 0, scale: 1 }

  useEffect(() => { onDone?.() }, []) // eslint-disable-line

  useEffect(() => {
    // Синхронный setState осознан: blob-URL живёт строго вместе с file.localFile
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.photo?.r2Url ?? null

  // Сброс медиасостояния при смене src — осознанный setState в эффекте
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIntrinsic(null); setImgReady(false) }, [src])

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    setFrameDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  function getMediaStyle() {
    if (!intrinsic || !frameDims) return {
      width: '100%', height: '100%', objectFit: 'cover',
      transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
    const { w: fw, h: fh } = frameDims
    const ma = intrinsic.w / intrinsic.h
    const fa = fw / fh
    const d = ma > fa ? { w: fh * ma, h: fh } : { w: fw, h: fw / ma }
    return {
      position: 'absolute', left: '50%', top: '50%',
      width: d.w + 'px', height: d.h + 'px',
      transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px)) scale(${crop.scale})`,
      transformOrigin: 'center center',
    }
  }

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--photo">
        {src
          ? <>
              <div
                ref={frameRef}
                className="playerPhotoCropFrame"
                onClick={() => setFullscreen(true)}
              >
                <img
                  src={src}
                  className="playerPhotoMedia"
                  style={{ ...getMediaStyle(), opacity: imgReady ? 1 : 0, transition: 'opacity 0.15s ease' }}
                  alt=""
                  draggable={false}
                  onLoad={e => { setIntrinsic({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }); setImgReady(true) }}
                />
              </div>
              {fullscreen && (
                <div className="photoFullOverlay" onClick={() => setFullscreen(false)}>
                  <button className="photoFullClose" onClick={e => { e.stopPropagation(); setFullscreen(false) }}>×</button>
                  <img src={src} className="photoFullImg" alt="" onClick={e => e.stopPropagation()} />
                </div>
              )}
            </>
          : <div className="playerMediaPlaceholder">Фото не загружено</div>
        }
      </PlayerBubble>
    </div>
  )
}
