import { useState, useRef, useEffect, useLayoutEffect } from 'react'

function truncate(name, max = 20) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

// Inline picker + crop editor for photo/video/circle nodes.
// shape='rect' → 4:5 portrait frame; shape='circle' → 1:1 round frame.
// Drag to pan, scroll-wheel / ± buttons to zoom.
// At scale=1 media just covers the frame. Below scale=1 real edges are visible.
export default function NodeMediaCrop({
  type, fileId, crop, lessonFiles, onPickFile, onCropChange, shape = 'rect',
}) {
  const file = lessonFiles.find(f => f.id === fileId) ?? null
  const [objectUrl,  setObjectUrl]  = useState(null)
  const [intrinsic,  setIntrinsic]  = useState(null)  // { w, h } natural media size
  const [frameDims,  setFrameDims]  = useState(null)
  const dragRef   = useRef(null)
  const frameRef  = useRef(null)
  const cropRef   = useRef(crop)
  const changeRef = useRef(onCropChange)

  useEffect(() => { cropRef.current  = crop },         [crop])
  useEffect(() => { changeRef.current = onCropChange }, [onCropChange])

  // Object URL for local files; revoke on change or unmount
  useEffect(() => {
    if (!file?.localFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const isVideo  = type === 'video' || type === 'circle'
  const accept   = type === 'photo' ? 'image/*' : 'video/*'
  const btnLabel = type === 'photo' ? '+ Выбрать фото' : type === 'circle' ? '+ Видео-кружок' : '+ Выбрать видео'
  const src      = file?.r2Url ?? objectUrl
  const frameClass = `mediaCropFrame${shape === 'circle' ? ' mediaCropFrameCircle' : ''}`

  // Measure frame dimensions after it appears (src-gated render).
  // Stored in state so it's safe to read during render.
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    setFrameDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  // Reset intrinsic size when source changes so fallback style is used during load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntrinsic(null)
  }, [src])

  // Scroll-wheel zoom — passive:false required for preventDefault.
  // Depends on src so the listener re-attaches when frame becomes visible.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const cur = cropRef.current
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      changeRef.current({ ...cur, scale: Math.min(6, Math.max(0.15, cur.scale * factor)) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [src])

  // Compute pixel size so media just covers the frame at scale=1.
  // Uses frameDims (state, safe to read in render) and intrinsic media size.
  function getMediaDims() {
    if (!intrinsic || !frameDims) return null
    const { w: fw, h: fh } = frameDims
    if (!fw || !fh) return null
    const ma = intrinsic.w / intrinsic.h
    const fa = fw / fh
    return ma > fa
      ? { w: fh * ma, h: fh }   // landscape: height fills frame, width overflows
      : { w: fw, h: fw / ma }   // portrait/square: width fills frame, height overflows
  }

  const dims = getMediaDims()
  // After load: absolutely centered media, scale reveals real edges below 1.
  // Before load: fallback cover so frame isn't blank.
  const mediaStyle = dims
    ? {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: dims.w + 'px',
        height: dims.h + 'px',
        transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px)) scale(${crop.scale})`,
        transformOrigin: 'center center',
      }
    : {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
        transformOrigin: 'center center',
      }

  function startDrag(cx, cy) {
    dragRef.current = { sx: cx, sy: cy, ox: crop.x, oy: crop.y }
  }
  function moveDrag(cx, cy) {
    if (!dragRef.current) return
    const d = dragRef.current
    onCropChange({ ...crop, x: d.ox + (cx - d.sx), y: d.oy + (cy - d.sy) })
  }
  function endDrag() { dragRef.current = null }

  function zoomBy(factor) {
    onCropChange({ ...crop, scale: Math.min(6, Math.max(0.15, crop.scale * factor)) })
  }

  function onVideoLoad(e) {
    setIntrinsic({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
  }
  function onImageLoad(e) {
    setIntrinsic({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
  }

  return (
    <div className="mediaCropWrap" onClick={e => e.stopPropagation()}>
      <div className="nodeAudioPicker">
        <label className="nodeAudioPickerLabel" onClick={e => e.stopPropagation()}>
          <input
            type="file"
            accept={accept}
            className="nodeAudioInput"
            onChange={e => {
              const f = e.target.files[0]
              if (f) onPickFile(f)
              e.target.value = ''
            }}
          />
          <span className="nodeAudioPickerBtn">
            {file ? truncate(file.name) : btnLabel}
          </span>
        </label>
        {file && (
          <span
            className={`nodeAudioStatus ${file.status !== 'local' ? 'nodeAudioStatusSynced' : 'nodeAudioStatusLocal'}`}
            title={file.status !== 'local' ? 'На сервере' : 'Локально, не загружено'}
          >
            {file.status !== 'local' ? '↑' : '○'}
          </span>
        )}
      </div>

      {src && (
        <>
          <div
            ref={frameRef}
            className={frameClass}
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, e.clientY) }}
            onMouseMove={e => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={e => { if (e.touches.length === 1) { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY) } }}
            onTouchMove={e => { if (e.touches.length === 1) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY) } }}
            onTouchEnd={endDrag}
          >
            {isVideo
              ? <video ref={el => { if (el) el.muted = true }} src={src} className="mediaCropMedia" style={mediaStyle} playsInline autoPlay loop onLoadedMetadata={onVideoLoad} />
              : <img src={src} className="mediaCropMedia" style={mediaStyle} draggable={false} alt="" onLoad={onImageLoad} />
            }
          </div>
          <div className="mediaCropControls">
            <button className="mediaCropZoomBtn" onClick={() => zoomBy(0.85)}>−</button>
            <span className="mediaCropScaleLabel">{Math.round(crop.scale * 100)}%</span>
            <button className="mediaCropZoomBtn" onClick={() => zoomBy(1.18)}>+</button>
            <button className="mediaCropResetBtn" onClick={() => onCropChange({ x: 0, y: 0, scale: 1 })}>сбросить</button>
          </div>
        </>
      )}
    </div>
  )
}
