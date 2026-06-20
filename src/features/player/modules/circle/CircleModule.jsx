import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R

function calcStyle(intrinsic, dims, crop) {
  if (!intrinsic || !dims) return {
    width: '100%', height: '100%', objectFit: 'cover',
    transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }
  const ma = intrinsic.w / intrinsic.h, fa = dims.w / dims.h
  const d = ma > fa ? { w: dims.h * ma, h: dims.h } : { w: dims.w, h: dims.w / ma }
  return {
    position: 'absolute', left: '50%', top: '50%',
    width: d.w + 'px', height: d.h + 'px',
    transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px)) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }
}

export default function CircleModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intr, setIntr] = useState(null)
  const [dims, setDims] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [expandLeft, setExpandLeft] = useState(0)

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }
  const vRef         = useRef(null)
  const frRef        = useRef(null)
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
    setIntr(null)
    doneFiredRef.current = false
  }, [src]) // eslint-disable-line

  useLayoutEffect(() => {
    const el = frRef.current; if (!el) return
    setDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  // onDone: fires at end of first loop (via timeupdate, not onEnded, because loop=true)
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
    // Unmute + restart from beginning (user gesture context → iOS allows)
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
    stopRaf()
    setExpanded(false)
    const v = vRef.current
    if (v) {
      v.muted = true
      v.play().catch(() => {})
    }
  }

  // Swipe down to collapse
  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) collapse()
  }

  useEffect(() => () => stopRaf(), [])

  // In expanded state use window dimensions (circle is 100vw × 100vw)
  const activeDims = expanded ? { w: window.innerWidth, h: window.innerWidth } : dims

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
            <div ref={frRef} className="circleFrame">
              <video
                ref={vRef} src={src} className="circleMedia"
                style={calcStyle(intr, activeDims, crop)}
                playsInline autoPlay muted loop preload="auto"
                onLoadedMetadata={e => setIntr({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                onTimeUpdate={handleTimeUpdate}
                onError={e => pLog('CircleModule onError', e.currentTarget.error?.code)}
              />
            </div>

            {/* Ring progress — visible only when expanded */}
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

            {/* Muted icon — visible only when not expanded */}
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
