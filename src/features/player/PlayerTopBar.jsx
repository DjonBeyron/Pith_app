import { useState, useEffect } from 'react'
import { clearPlayerLog, pLog, setDebug } from '../../shared/lib/debug.js'
import { preloadSounds } from '../../shared/lib/sounds.js'
import { APP_VERSION } from '../../shared/lib/version.js'

// Must match AvatarCrop.jsx AVATAR_CROP_FRAME = 80
const CROP_FRAME  = 80
const AVATAR_SIZE = 36

export default function PlayerTopBar({ title, onClose, teacherName, teacherLogo, teacherLogoCrop, onDownloadLog }) {
  const [intrinsic, setIntrinsic] = useState(null)

  useEffect(() => { setIntrinsic(null) }, [teacherLogo])

  useEffect(() => {
    setDebug(true)
    clearPlayerLog()
    pLog('=== Player opened ===', 'v' + APP_VERSION, 'ua:', navigator.userAgent)
    preloadSounds()
  }, [])

  const name    = teacherName || 'Учитель'
  const initial = name[0]?.toUpperCase() ?? 'У'
  const crop    = teacherLogoCrop ?? { x: 0, y: 0, scale: 1 }
  const ratio   = AVATAR_SIZE / CROP_FRAME

  // Same formula as AvatarCrop.getMediaDims() but for AVATAR_SIZE frame
  function getAvatarDims() {
    if (!intrinsic) return null
    const ma = intrinsic.w / intrinsic.h
    return ma > 1
      ? { w: AVATAR_SIZE * ma, h: AVATAR_SIZE }
      : { w: AVATAR_SIZE, h: AVATAR_SIZE / ma }
  }

  const dims = getAvatarDims()

  // Exact same rendering approach as AvatarCrop — absolute positioning + scaled x,y
  const imgStyle = dims
    ? {
        position: 'absolute',
        left: '50%', top: '50%',
        width: dims.w + 'px', height: dims.h + 'px',
        transform: `translate(calc(-50% + ${crop.x * ratio}px), calc(-50% + ${crop.y * ratio}px)) scale(${crop.scale})`,
        transformOrigin: 'center center',
        userSelect: 'none',
        pointerEvents: 'none',
      }
    : {
        position: 'absolute',
        width: '100%', height: '100%',
        objectFit: 'cover',
      }

  return (
    <div className="playerTopBar">
      <button className="playerTopBarBack" onClick={onClose}>←</button>
      <div className="playerTopBarAvatar">
        {teacherLogo
          ? <img
              src={teacherLogo}
              alt=""
              style={imgStyle}
              draggable={false}
              onLoad={e => setIntrinsic({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
          : initial
        }
      </div>
      <div className="playerTopBarInfo">
        <span className="playerTopBarName">{name}</span>
        <span className="playerTopBarStatus">онлайн</span>
      </div>
      {title && <span className="playerTopBarLesson">{title}</span>}
      <button
        className="playerTopBarDebugBtn"
        onClick={onDownloadLog}
        title="Скачать лог"
        aria-label="Скачать лог"
      >⬇ лог</button>
    </div>
  )
}
