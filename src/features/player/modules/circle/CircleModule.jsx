import { useState, useEffect, useRef } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R

// objectFit: cover — video follows container CSS transition smoothly.
// crop.x/y/scale applied as transform on top (admin-set pixel offsets).
function videoStyle(crop) {
  return {
    width: '100%', height: '100%', objectFit: 'cover',
    transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }
}

export default function CircleModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [expandLeft, setExpandLeft] = useState(0)

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }
  const vRef         = useRef(null)
  const wrapRef      = useRef(null)
  const arcRef       = useRef(null)
  const rafRef       = useRef(null)
  const touchStartY  = useRef(0)
  const doneFiredRef = useRef(false)

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.circle?.r2Url ?? null

  useEffect(() => {
    pLog('CircleModule src=', src ? (src.startsWith('blob:') ? 'blob:...' : src) : 'NULL',
      '| blobUrl=', file?.blobUrl ? 'YES' : 'no')
    doneFiredRef.current = false
  }, [src]) // eslint-disable-line

  // onDone: fires at end of first loop (via timeupdate — loop attr prevents onEnded)
  function handleTimeUpdate(e) {
    if (doneFiredRef.current) return
    const v = e.currentTarget
    if (v.duration && v.currentTime >= v.duration - 0.15) {
      doneFiredRef.current = true
      pLog('CircleModule: first loop end → onDone()')
      onDone?.()
    }
  }

  // rAF loop for smooth ring progress
  function startRaf() {
    const tick = () => {
      const v = vRef.current
      if (v && arcRef.current && v.duration) {
        const p = v.currentTime / v.duration
        arcRef.current.style.strokeDashoffset = String(RING_C * (1 - p))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stopRaf() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (arcRef.current) arcRef.current.style.strokeDashoffset = String(RING_C)
  }

  function handleTap() {
    if (expanded) { collapse(); return }
    const rect = wrapRef.current.getBoundingClientRect()
    const ml = -rect.left
    pLog('CircleModule expand: rect=', JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }),
      '| window.innerWidth=', window.innerWidth, '| marginLeft=', Math.round(ml))
    setExpandLeft(ml)
    setExpanded(true)
    startRaf()
    const v = vRef.current
    if (v) {
      v.muted = false
      v.currentTime = 0
      v.play().catch(() => {
        pLog('CircleModule: unmuted play failed → stay muted')
        v.muted = true
        v.play().catch(() => {})
      })
    }
  }

  function collapse() {
    pLog('CircleModule collapse: expanded=', expanded, '| expandLeft=', expandLeft)
    stopRaf()
    setExpanded(false)
    setExpandLeft(0)
    const v = vRef.current
    if (v) {
      v.muted = true
      v.play().catch(() => {})
    }
  }

  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) collapse()
  }

  useEffect(() => () => stopRaf(), [])

  const expandedStyle = expanded
    ? { width: '100vw', height: '100vw', marginLeft: `${expandLeft}px`, zIndex: 10 }
    : {}

  return (
    <div className="playerMsgRow playerMsgRowCircle">
      <PlayerBubble className={`playerMsgBubble playerMsgBubble--circle${expanded ? ' playerMsgBubble--circle--expanded' : ''}`}>
        {src ? (
          <div
            ref={wrapRef}
            className={`circleWrap${expanded ? ' circleWrap--expanded' : ''}`}
            style={expandedStyle}
            onClick={handleTap}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="circleFrame">
              <video
                ref={vRef} src={src} className="circleMedia"
                style={videoStyle(crop)}
                playsInline autoPlay muted loop preload="auto"
                onTimeUpdate={handleTimeUpdate}
                onError={e => pLog('CircleModule onError', e.currentTarget.error?.code)}
              />
            </div>

            {expanded && (
              <svg className="circleRingSvg" viewBox="0 0 218 218" aria-hidden="true">
                <circle cx="109" cy="109" r={RING_R} fill="none"
                  stroke="rgba(255,255,255,.15)" strokeWidth="3" />
                <circle ref={arcRef} cx="109" cy="109" r={RING_R} fill="none"
                  stroke="#b6fe3b" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${RING_C} 9999`} strokeDashoffset={String(RING_C)}
                  transform="rotate(-90 109 109)"
                />
              </svg>
            )}

            {!expanded && <CircleMutedIcon />}
          </div>
        ) : <div className="playerMediaPlaceholder">Кружок не загружен</div>}
      </PlayerBubble>
    </div>
  )
}

function CircleMutedIcon() {
  return (
    <div className="circleMutedIcon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M11 5L6 9H2v6h4l5 4V5z" fill="white" fillOpacity="0.9"/>
        <line x1="23" y1="9" x2="17" y2="15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <line x1="17" y1="9" x2="23" y2="15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  )
}
