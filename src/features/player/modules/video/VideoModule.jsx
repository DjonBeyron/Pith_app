import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'

export default function VideoModule({ node, file }) {
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [intrinsic,  setIntrinsic]  = useState(null)
  const [frameDims,  setFrameDims]  = useState(null)
  const videoRef   = useRef(null)
  const frameRef   = useRef(null)
  const spinnerRef = useRef(null)

  const crop = node.typeData?.video?.crop ?? { x: 0, y: 0, scale: 1 }

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = file?.r2Url ?? objectUrl

  useEffect(() => { setIntrinsic(null) }, [src])

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

  function handleEnded() {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.loop  = true
    v.play()
  }

  function handleCanPlay(e) {
    e.currentTarget.style.opacity = '1'
    if (spinnerRef.current) spinnerRef.current.style.display = 'none'
  }

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--video">
        {src
          ? <>
              <div
                ref={frameRef}
                className="playerVideoCropFrame"
                onClick={() => setFullscreen(true)}
              >
                <video
                  ref={videoRef}
                  src={src}
                  className="playerVideoMedia"
                  style={getMediaStyle()}
                  playsInline
                  autoPlay
                  onEnded={handleEnded}
                  onLoadedMetadata={e => setIntrinsic({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                />
              </div>
              {fullscreen && (
                <div className="videoFullOverlay" onClick={() => setFullscreen(false)}>
                  <button className="videoFullClose" onClick={e => { e.stopPropagation(); setFullscreen(false) }}>×</button>
                  <div ref={spinnerRef} className="videoFullSpinner" />
                  <video
                    src={src}
                    className="videoFullPlayer"
                    style={{ opacity: 0 }}
                    autoPlay
                    loop
                    playsInline
                    onCanPlay={handleCanPlay}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}
            </>
          : <div className="playerMediaPlaceholder">Видео не загружено</div>
        }
      </PlayerBubble>
    </div>
  )
}
