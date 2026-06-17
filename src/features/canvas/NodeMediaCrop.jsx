import { useState, useRef, useEffect } from 'react'

function truncate(name, max = 20) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

// Inline picker + crop editor for photo/video/circle nodes.
// shape='rect' → 4:5 portrait frame; shape='circle' → 1:1 round frame.
// Drag to pan, scroll-wheel / ± buttons to zoom.
// Crop state { x, y, scale } is saved in the node via onCropChange.
export default function NodeMediaCrop({
  type, fileId, crop, lessonFiles, onPickFile, onCropChange, shape = 'rect',
}) {
  const file = lessonFiles.find(f => f.id === fileId) ?? null
  const [objectUrl, setObjectUrl] = useState(null)
  const dragRef    = useRef(null)
  const frameRef   = useRef(null)
  const cropRef    = useRef(crop)
  const changeRef  = useRef(onCropChange)

  useEffect(() => { cropRef.current = crop },         [crop])
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

  // Scroll-wheel zoom — needs passive:false for preventDefault
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const cur = cropRef.current
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      changeRef.current({ ...cur, scale: Math.min(6, Math.max(0.5, cur.scale * factor)) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const isVideo  = type === 'video' || type === 'circle'
  const accept   = type === 'photo' ? 'image/*' : 'video/*'
  const btnLabel = type === 'photo' ? '+ Выбрать фото' : type === 'circle' ? '+ Видео-кружок' : '+ Выбрать видео'
  const src      = file?.r2Url ?? objectUrl
  const frameClass = `mediaCropFrame${shape === 'circle' ? ' mediaCropFrameCircle' : ''}`

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
    onCropChange({ ...crop, scale: Math.min(6, Math.max(0.5, crop.scale * factor)) })
  }

  const mediaStyle = {
    transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }

  return (
    <div className="mediaCropWrap" onClick={e => e.stopPropagation()}>
      {/* File picker + status */}
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

      {/* Crop frame — visible only when file is selected */}
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
              ? <video ref={el => { if (el) el.muted = true }} src={src} className="mediaCropMedia" style={mediaStyle} playsInline autoPlay loop />
              : <img src={src} className="mediaCropMedia" style={mediaStyle} draggable={false} alt="" />
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
