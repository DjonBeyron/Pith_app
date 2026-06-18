import { useState, useRef, useEffect, useLayoutEffect } from 'react'

// Circular crop editor for teacher avatar.
// Frame size = 80px (AVATAR_CROP_FRAME). PlayerTopBar scales offsets by 36/80.
export const AVATAR_CROP_FRAME = 80

export default function AvatarCrop({ src, crop, onCropChange }) {
  const [intrinsic, setIntrinsic] = useState(null)
  const [frameDims, setFrameDims] = useState(null)
  const dragRef   = useRef(null)
  const frameRef  = useRef(null)
  const cropRef   = useRef(crop)
  const changeRef = useRef(onCropChange)

  useEffect(() => { cropRef.current   = crop },         [crop])
  useEffect(() => { changeRef.current = onCropChange }, [onCropChange])

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    setFrameDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntrinsic(null)
  }, [src])

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const cur = cropRef.current
      const f = e.deltaY > 0 ? 0.9 : 1.1
      changeRef.current({ ...cur, scale: Math.min(6, Math.max(0.15, cur.scale * f)) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [src])

  function getMediaDims() {
    if (!intrinsic || !frameDims) return null
    const { w: fw, h: fh } = frameDims
    if (!fw || !fh) return null
    const ma = intrinsic.w / intrinsic.h
    const fa = fw / fh
    return ma > fa ? { w: fh * ma, h: fh } : { w: fw, h: fw / ma }
  }

  const dims = getMediaDims()
  const mediaStyle = dims
    ? {
        position: 'absolute', left: '50%', top: '50%',
        width: dims.w + 'px', height: dims.h + 'px',
        transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px)) scale(${crop.scale})`,
        transformOrigin: 'center center',
      }
    : {
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`,
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
  function zoomBy(f) {
    onCropChange({ ...crop, scale: Math.min(6, Math.max(0.15, crop.scale * f)) })
  }

  return (
    <div className="avatarCropWrap">
      <div
        ref={frameRef}
        className="mediaCropFrame mediaCropFrameCircle avatarCropFrame"
        onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
        onMouseMove={e => moveDrag(e.clientX, e.clientY)}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={e => { if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
        onTouchMove={e => { if (e.touches.length === 1) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY) } }}
        onTouchEnd={endDrag}
      >
        <img
          src={src}
          className="mediaCropMedia"
          style={mediaStyle}
          draggable={false}
          alt=""
          onLoad={e => setIntrinsic({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      </div>
      <div className="mediaCropControls">
        <button className="mediaCropZoomBtn" onClick={() => zoomBy(0.85)}>−</button>
        <span className="mediaCropScaleLabel">{Math.round(crop.scale * 100)}%</span>
        <button className="mediaCropZoomBtn" onClick={() => zoomBy(1.18)}>+</button>
        <button className="mediaCropResetBtn" onClick={() => onCropChange({ x: 0, y: 0, scale: 1 })}>сбросить</button>
      </div>
    </div>
  )
}
