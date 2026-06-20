import { useState, useEffect, useRef } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R
const EDGE_GAP = 24 // px отступ от каждого края в expanded-режиме

export default function CircleModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [expandStyle, setExpandStyle] = useState({})

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }
  const vRef         = useRef(null)
  const wrapRef      = useRef(null)
  const arcRef       = useRef(null)
  const rafRef       = useRef(null)
  const touchStartY  = useRef(0)
  const doneFiredRef = useRef(false)
  const expandedRef  = useRef(false) // синхронная копия expanded для onEnded

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

  // onDone: конец первого цикла (loop=true → onEnded не стреляет, используем timeupdate)
  function handleTimeUpdate(e) {
    if (doneFiredRef.current || expandedRef.current) return
    const v = e.currentTarget
    if (v.duration && v.currentTime >= v.duration - 0.15) {
      doneFiredRef.current = true
      pLog('CircleModule: first loop end → onDone()')
      onDone?.()
    }
  }

  // onEnded стреляет только в expanded-режиме (там loop=false) → автозакрытие
  function handleEnded() {
    pLog('CircleModule: video ended in expanded → auto-collapse')
    collapse()
  }

  // rAF для плавного кольца прогресса
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
    if (expandedRef.current) { collapse(); return }
    const rect = wrapRef.current.getBoundingClientRect()
    const expandW = window.innerWidth - EDGE_GAP * 2
    const ml = -(rect.left - EDGE_GAP)
    pLog('CircleModule expand: rect=', JSON.stringify({ left: Math.round(rect.left), w: Math.round(rect.width) }),
      '| innerWidth=', window.innerWidth, '| expandW=', expandW, '| ml=', Math.round(ml))

    setExpandStyle({ width: expandW + 'px', height: expandW + 'px', marginLeft: ml + 'px', zIndex: 10 })
    setExpanded(true)
    expandedRef.current = true
    startRaf()

    const v = vRef.current
    if (v) {
      v.loop = false // чтобы onEnded стрелял — авто-выход после воспроизведения
      v.muted = false
      v.currentTime = 0
      v.play().catch(() => {
        pLog('CircleModule: unmuted play failed → stay muted')
        v.muted = true
        v.loop = true
        v.play().catch(() => {})
      })
    }
  }

  function collapse() {
    pLog('CircleModule collapse: expandedRef=', expandedRef.current)
    stopRaf()
    expandedRef.current = false
    setExpanded(false)
    setExpandStyle({})
    const v = vRef.current
    if (v) {
      v.loop = true
      v.muted = true
      v.play().catch(() => {})
    }
  }

  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) collapse()
  }

  useEffect(() => () => stopRaf(), [])

  // Стиль видео: position absolute, inset 0 — чтобы objectFit: cover корректно
  // заполнял контейнер с position: absolute (circleFrame)
  const mediaStyle = {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    objectFit: 'cover',
    transform: `translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`,
    transformOrigin: 'center center',
  }

  return (
    <div className="playerMsgRow playerMsgRowCircle">
      <PlayerBubble className={`playerMsgBubble playerMsgBubble--circle${expanded ? ' playerMsgBubble--circle--expanded' : ''}`}>
        {src ? (
          <div
            ref={wrapRef}
            className={`circleWrap${expanded ? ' circleWrap--expanded' : ''}`}
            style={expandStyle}
            onClick={handleTap}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="circleFrame">
              <video
                ref={vRef} src={src} className="circleMedia"
                style={mediaStyle}
                playsInline autoPlay muted loop preload="auto"
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
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
