import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R
const EDGE_GAP = 24

function getSmallPx() {
  return Math.min(window.innerWidth * 0.5, 200)
}

function calcStyle(intrinsic, dims, crop) {
  if (!intrinsic || !dims) return {
    position: 'absolute', inset: 0, objectFit: 'cover',
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

export default function CircleModule({ node, file, onDone, bottomOffset = 0, videoAutoSound }) {
  const [objectUrl, setObjectUrl]   = useState(null)
  const [intr, setIntr]             = useState(null)
  const [dims, setDims]             = useState(null)
  const [expanded, setExpanded]     = useState(false)
  const [collapsing, setCollapsing] = useState(false)
  const [expandTransform, setExpandTransform] = useState(null)
  const [videoVisible, setVideoVisible] = useState(false)
  const [mutedLoop, setMutedLoop]   = useState(false)  // videoAutoSound: true after first play

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }

  const vRef          = useRef(null)
  const wrapRef       = useRef(null)
  const frRef         = useRef(null)
  const arcRef        = useRef(null)
  const collapseTimer = useRef(null)
  const touchStartY   = useRef(0)
  const doneFiredRef      = useRef(false)
  const firstPlayDoneRef  = useRef(false)  // videoAutoSound: true after first unmuted play ends
  const expandedRef   = useRef(false)
  const animatingRef  = useRef(false)
  const expandWRef    = useRef(0)
  const halfGrowRef   = useRef(0)
  const prevRowsRef   = useRef([])
  const flipObserver  = useRef(null)

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src    = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.circle?.r2Url ?? null
  const poster = file?.posterUrl ?? undefined

  useEffect(() => {
    setIntr(null)
    setVideoVisible(false)
    setMutedLoop(false)
    doneFiredRef.current = false
    firstPlayDoneRef.current = false
  }, [src]) // eslint-disable-line

  useLayoutEffect(() => {
    const el = frRef.current; if (!el) return
    setDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  // videoAutoSound: called on onLoadedData — sets up MutationObserver then unmuted play
  function handleCircleLoaded() {
    if (!videoAutoSound || firstPlayDoneRef.current) return
    const v = vRef.current
    if (!v) return
    v.muted = false
    v.loop  = false

    function playAfterAnimation() {
      setTimeout(() => {
        if (firstPlayDoneRef.current) return
        pLog('[circle] autoSound — play unmuted after animation')
        v.play().catch(() => {
          pLog('[circle] autoSound unmuted failed → muted fallback')
          v.muted = true; v.loop = true
          v.play().catch(() => {})
          firstPlayDoneRef.current = true
          setMutedLoop(true)
          onDone?.()
        })
      }, 200)
    }

    const pendingWrapper = v.closest('[data-pending]')
    if (!pendingWrapper) {
      playAfterAnimation()
    } else {
      const observer = new MutationObserver(() => {
        if (!pendingWrapper.hasAttribute('data-pending')) {
          observer.disconnect()
          pLog('[circle] autoSound — pending removed, starting countdown')
          playAfterAnimation()
        }
      })
      observer.observe(pendingWrapper, { attributes: true, attributeFilter: ['data-pending'] })
    }
  }

  function handleEnded() {
    // videoAutoSound: first inline unmuted play ended → switch to muted loop
    if (videoAutoSound && !firstPlayDoneRef.current && !expandedRef.current) {
      firstPlayDoneRef.current = true
      pLog('[circle] autoSound — first play ended → muted loop')
      onDone?.()
      const v = vRef.current
      if (!v) return
      v.muted = true; v.loop = true
      v.currentTime = 0
      v.play().catch(() => {})
      setMutedLoop(true)
      return
    }
    if (!expandedRef.current) return
    if (doneFiredRef.current) {
      const v = vRef.current
      const arc = arcRef.current
      if (v) v.currentTime = 0
      if (arc) {
        arc.style.animation = 'none'
        arc.style.transition = 'stroke-dashoffset 0.3s ease'
        arc.style.strokeDashoffset = String(RING_C)
      }
      setTimeout(() => {
        if (!expandedRef.current) return
        if (arc) arc.style.transition = ''
        if (v) v.play().catch(() => {})
      }, 350)
      return
    }
    doneFiredRef.current = true
    if (arcRef.current) {
      arcRef.current.style.animation = 'none'
      arcRef.current.style.strokeDashoffset = '0'
    }
    onDone?.()
    collapse()
  }

  function handlePlaying() {
    if (!expandedRef.current) return
    const v = vRef.current
    if (v?.duration) startRingAnimation(v.duration - v.currentTime)
  }

  function startRingAnimation(duration) {
    if (!arcRef.current) return
    arcRef.current.style.animation = `circleRingProgress ${duration}s linear forwards`
  }

  function stopRingAnimation() {
    if (!arcRef.current) return
    arcRef.current.style.animation = 'none'
    arcRef.current.style.strokeDashoffset = String(RING_C)
  }

  function stopRaf() { stopRingAnimation() }

  function handleTap() {
    if (animatingRef.current || collapseTimer.current) return
    // Block tap while feed is animating new messages (190ms slide-in)
    const feedInner = wrapRef.current?.closest('.playerFeedInner')
    if (feedInner) {
      const feedAnimating = [...feedInner.querySelectorAll('.playerMsgRow')]
        .some(el => el.getAnimations().some(a => a.playState === 'running'))
      if (feedAnimating) return
    }
    if (expandedRef.current) { collapse(); return }

    const s = dims?.w ?? getSmallPx()
    const rect = wrapRef.current.getBoundingClientRect()
    const centerY = rect.top + s / 2

    const row = wrapRef.current.closest('.playerMsgRow')
    // Each .playerMsgRow is wrapped in a key-div; go up to playerFeedInner
    const inner = row?.closest('.playerFeedInner')
    const rowWrapper = row?.parentElement
    const nextWrapper = rowWrapper?.nextElementSibling
    const nextRow = nextWrapper?.querySelector('.playerMsgRow') ?? null
    let nextMsgTop = window.innerHeight
    if (nextRow) {
      const visualTop = nextRow.getBoundingClientRect().top
      if (visualTop <= window.innerHeight) {
        nextMsgTop = visualTop
      } else {
        const innerTop = inner ? inner.getBoundingClientRect().top : 0
        nextMsgTop = innerTop + (nextWrapper?.offsetTop ?? 0)
      }
    }
    const bottomLimit = Math.min(window.innerHeight - bottomOffset, nextMsgTop) - EDGE_GAP

    const expandW = window.innerWidth - EDGE_GAP * 2
    const ratio = expandW / s
    const ty = Math.min(0, bottomLimit - (centerY + expandW / 2))
    const visualLeft = rect.left - s * (ratio - 1) / 2
    const tx = EDGE_GAP - visualLeft
    const halfGrow = (expandW - s) / 2 - ty

    expandWRef.current = expandW
    halfGrowRef.current = halfGrow

    if (inner) {
      const rows = [...inner.querySelectorAll('.playerMsgRow')]
      const idx = rows.indexOf(row)
      const prev = rows.slice(0, idx)
      prevRowsRef.current = prev
      prev.forEach(el => {
        el.style.transition = 'transform 0.24s cubic-bezier(0.4,0,1,1)'
        el.style.transform = `translateY(-${halfGrow}px)`
      })

      if (flipObserver.current) flipObserver.current.disconnect()
      flipObserver.current = new MutationObserver(() => {
        if (!expandedRef.current) return
        setTimeout(() => {
          if (!expandedRef.current) return
          prevRowsRef.current.forEach(el => {
            el.style.transition = 'none'
            el.style.transform = `translateY(-${halfGrowRef.current}px)`
          })
        }, 420)
      })
      flipObserver.current.observe(inner, { childList: true })
    }

    setExpandTransform(ty !== 0
      ? `translateX(${tx}px) translateY(${ty}px) scale(${ratio})`
      : `translateX(${tx}px) scale(${ratio})`)
    setExpanded(true)
    expandedRef.current = true
    animatingRef.current = true
    setTimeout(() => { animatingRef.current = false }, 300)

    const v = vRef.current
    if (v) {
      v.pause()
      v.loop = false
      v.currentTime = 0
    }

    setTimeout(() => {
      const v2 = vRef.current
      if (!v2 || !expandedRef.current) return
      v2.muted = false
      v2.play()
        .catch(err => {
          console.warn('CircleModule: unmuted play failed:', err.message)
          v2.muted = true
          v2.loop = true
          v2.play().catch(() => {})
        })
    }, 260)
  }

  function collapse() {
    stopRaf()

    if (!doneFiredRef.current) {
      const v = vRef.current
      const watched = v?.duration ? v.currentTime / v.duration : 0
      if (watched >= 0.2) {
        doneFiredRef.current = true
        onDone?.()
      }
    }

    if (flipObserver.current) { flipObserver.current.disconnect(); flipObserver.current = null }
    prevRowsRef.current.forEach(el => {
      el.style.transition = 'transform 0.24s cubic-bezier(0.4,0,1,1)'
      el.style.transform = ''
    })
    prevRowsRef.current = []

    expandedRef.current = false
    setExpanded(false)
    setCollapsing(true)
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null
      setCollapsing(false)
      setExpandTransform(null)
    }, 500)

    const v = vRef.current
    if (v) {
      v.loop = true
      v.muted = true
      v.currentTime = 0
      v.play().catch(() => {})
    }
  }

  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) collapse()
  }

  useEffect(() => () => {
    stopRaf()
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    if (flipObserver.current) { flipObserver.current.disconnect(); flipObserver.current = null }
  }, [])

  const s = dims?.w ?? getSmallPx()
  const wrapStyle = {
    width: s + 'px',
    height: s + 'px',
    ...(expanded ? { transform: expandTransform ?? undefined, zIndex: 10 } : {}),
    ...(collapsing && !expanded ? { zIndex: 10 } : {}),
  }

  const videoStyle = calcStyle(intr, dims, crop)

  return (
    <div className="playerMsgRow playerMsgRowCircle">
      {expanded && (
        <div className="circleBackdrop" onClick={collapse} />
      )}
      <div className={`playerMsgBubble playerMsgBubble--circle${(expanded || collapsing) ? ' playerMsgBubble--circle--expanded' : ''}`}>
        {src ? (
          <div
            ref={wrapRef}
            className="circleWrap"
            style={wrapStyle}
            onClick={handleTap}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div ref={frRef} className="circleFrame">
              <video
                ref={vRef} src={src} poster={poster} className="circleMedia"
                style={{ ...videoStyle, opacity: videoVisible ? 1 : 0 }}
                playsInline preload="auto"
                autoPlay={!videoAutoSound}
                muted={!videoAutoSound}
                loop={!videoAutoSound}
                onLoadedMetadata={e => {
                  const v = e.currentTarget
                  setIntr({ w: v.videoWidth, h: v.videoHeight })
                }}
                onCanPlay={() => setVideoVisible(true)}
                onLoadedData={videoAutoSound ? handleCircleLoaded : undefined}
                onPlaying={handlePlaying}
                onEnded={handleEnded}
              />
            </div>

            <svg className="circleRingSvg" viewBox="0 0 218 218" aria-hidden="true"
              style={{
                opacity: (expanded && !collapsing) ? 1 : 0,
                transition: 'opacity 0.15s ease',
                transitionDelay: (expanded && !collapsing) ? '0.12s' : '0s',
              }}>
              <circle cx="109" cy="109" r={RING_R} fill="none"
                stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
              <circle ref={arcRef} cx="109" cy="109" r={RING_R} fill="none"
                stroke="#b6fe3b" strokeWidth="1.5" strokeLinecap="round"
                strokeDasharray={`${RING_C} 9999`} strokeDashoffset={String(RING_C)}
                transform="rotate(-90 109 109)"
              />
            </svg>

            <div className="circleMutedIcon" style={{
              opacity: (!expanded && !collapsing && (!videoAutoSound || mutedLoop)) ? 1 : 0,
              transition: (!expanded && !collapsing) ? 'opacity 0.2s ease 0.1s' : 'opacity 0s',
              pointerEvents: 'none',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M11 5L6 9H2v6h4l5 4V5z" fill="white" fillOpacity="0.9"/>
                <line x1="23" y1="9" x2="17" y2="15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <line x1="17" y1="9" x2="23" y2="15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        ) : <div className="playerMediaPlaceholder">Видеосообщение не загружено</div>}
      </div>
    </div>
  )
}
