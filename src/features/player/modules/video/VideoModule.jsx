import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

// autoPlay+muted+playsInline — единственная комбинация которую iOS разрешает без жеста пользователя.
// Анимация slide-in держит элемент прозрачным 400мс (fill:'backwards'), поэтому видео играет
// невидимо под анимацией и становится видимым уже в движении — это и есть «запуск после анимации».

export default function VideoModule({ node, file, onDone }) {
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

  const src = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.video?.r2Url ?? null

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

  const videoDoneFiredRef = useRef(false)
  function handleEnded() {
    if (!videoDoneFiredRef.current) { videoDoneFiredRef.current = true; onDone?.() }
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
                  muted
                  preload="auto"
                  onPlay={e => { e.currentTarget.muted = false }}
                  onEnded={handleEnded}
                  onLoadedMetadata={e => {
                    const v = e.currentTarget
                    setIntrinsic({ w: v.videoWidth, h: v.videoHeight })
                    pLog('VideoModule onLoadedMetadata — readyState=', v.readyState, 'networkState=', v.networkState, 'duration=', v.duration)
                  }}
                  onError={e => {
                    const v = e.currentTarget
                    pLog('VideoModule onError — error=', v.error?.code, v.error?.message, 'src=', src)
                  }}
                  onStalled={() => pLog('VideoModule onStalled — network stalled')}
                  onWaiting={() => pLog('VideoModule onWaiting — buffering')}
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
