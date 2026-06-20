import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R
const EDGE_GAP = 24

function getSmallPx() {
  return Math.min(window.innerWidth * 0.5, 200)
}

// Intrinsic-based positioning — совпадает с редактором.
// Используется и для малого кружка, и для expanded (с другими dims).
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

export default function CircleModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [intr, setIntr] = useState(null)
  const [dims, setDims] = useState(null)
  const [expanded, setExpanded] = useState(false)
  // collapsing: держит expandedVideoStyle пока анимация схлопывания не завершена
  const [collapsing, setCollapsing] = useState(false)
  const [wrapStyle, setWrapStyle] = useState(() => {
    const s = getSmallPx()
    return { width: s + 'px', height: s + 'px', marginLeft: '0px' }
  })

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }
  const vRef            = useRef(null)
  const wrapRef         = useRef(null)
  const frRef           = useRef(null)
  const arcRef          = useRef(null)
  const rafRef          = useRef(null)
  const collapseTimer   = useRef(null)
  const touchStartY     = useRef(0)
  const doneFiredRef    = useRef(false)  // защита от двойного срабатывания onDone
  const expandedRef     = useRef(false)
  const lastRafTime     = useRef(0)
  const expandDimsRef   = useRef(null)  // dims кружка в expanded (для calcStyle с crop)

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

  function handleEnded() {
    if (!expandedRef.current) return  // малый кружок зациклен, ended не должен срабатывать
    if (doneFiredRef.current) return
    doneFiredRef.current = true
    pLog('CircleModule: expanded video ended → onDone + collapse')
    onDone?.()
    collapse()
  }

  // Throttle SVG ring updates to 15fps max — иначе 60fps strokeDashoffset
  // repaints на iOS конкурируют с video decoder и вызывают подёргивание
  function startRaf() {
    const tick = (t) => {
      if (t - lastRafTime.current >= 33) { // ~30fps
        lastRafTime.current = t
        const v = vRef.current
        if (v && arcRef.current && v.duration) {
          const p = v.currentTime / v.duration
          arcRef.current.style.strokeDashoffset = String(RING_C * (1 - p))
        }
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

    expandDimsRef.current = { w: expandW, h: expandW }
    setWrapStyle({ width: expandW + 'px', height: expandW + 'px', marginLeft: ml + 'px', zIndex: 10 })
    setExpanded(true)
    expandedRef.current = true
    startRaf()

    const v = vRef.current
    if (v) {
      // pause+seek до unmute — иначе muted=false на текущей позиции
      // даёт слышимый глюк пока seek ещё не выполнен
      v.pause()
      v.loop = false
      v.currentTime = 0
      v.muted = false
      v.play()
        .then(() => pLog('CircleModule: expanded play OK'))
        .catch(err => {
          pLog('CircleModule: unmuted play failed:', err.message, '→ stay muted')
          v.muted = true
          v.loop = true
          v.play().catch(() => {})
        })
    }
  }

  function collapse() {
    pLog('CircleModule collapse: expanded=', expandedRef.current)
    stopRaf()
    expandedRef.current = false
    setExpanded(false)

    // Держим expandedVideoStyle пока анимация схлопывания (0.38s) не завершится.
    // Без этого videoStyle мгновенно переключается на calcStyle(dims 200px)
    // пока circleWrap ещё 354px → видео "прыгает" в позицию для малого кружка.
    setCollapsing(true)
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => {
      pLog('CircleModule: collapsing timer done → setCollapsing(false)')
      setCollapsing(false)
    }, 500)

    const s = getSmallPx()
    setWrapStyle({ width: s + 'px', height: s + 'px', marginLeft: '0px' })
    const v = vRef.current
    if (v) {
      v.loop = true
      v.muted = true
      v.currentTime = 0  // видео закончилось — перемотать в начало перед play()
      v.play().catch(err => pLog('CircleModule collapse play failed:', err.message))
    }
  }

  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e) {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) collapse()
  }

  useEffect(() => () => {
    stopRaf()
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
  }, [])

  // crop.x/y заданы для малого кружка (dims.w пикс). В expanded видео физически
  // больше в ratio раз — масштабируем x/y чтобы сдвиг выглядел одинаково.
  const expandVideoStyle = (() => {
    const ed = expandDimsRef.current
    if (!ed || !dims?.w) return calcStyle(intr, ed, crop)
    const ratio = ed.w / dims.w
    return calcStyle(intr, ed, { x: crop.x * ratio, y: crop.y * ratio, scale: crop.scale })
  })()
  const videoStyle = (expanded || collapsing) ? expandVideoStyle : calcStyle(intr, dims, crop)

  return (
    <div className="playerMsgRow playerMsgRowCircle">
      {/* plain div — не PlayerBubble: ResizeObserver внутри него ставит overflow:hidden
          при схлопывании, что обрезает кружок, и конкурирует с CSS transition → дёрганья */}
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
                ref={vRef} src={src} className="circleMedia"
                style={videoStyle}
                playsInline autoPlay muted loop preload="auto"
                onLoadedMetadata={e => {
                  const v = e.currentTarget
                  setIntr({ w: v.videoWidth, h: v.videoHeight })
                  pLog('CircleModule meta:', v.videoWidth, 'x', v.videoHeight, 'rs=', v.readyState)
                }}
                onCanPlay={() => pLog('CircleModule canPlay expanded=', expandedRef.current)}
                onWaiting={() => pLog('CircleModule WAITING (buffering) expanded=', expandedRef.current)}
                onStalled={() => pLog('CircleModule STALLED expanded=', expandedRef.current)}
                onEnded={handleEnded}
                onError={e => pLog('CircleModule onError', e.currentTarget.error?.code)}
              />
            </div>

            {(expanded || collapsing) && (
              <svg className="circleRingSvg" viewBox="0 0 218 218" aria-hidden="true"
                style={{ opacity: collapsing ? 0 : 1, transition: 'opacity 0.2s ease' }}>
                <circle cx="109" cy="109" r={RING_R} fill="none"
                  stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
                <circle ref={arcRef} cx="109" cy="109" r={RING_R} fill="none"
                  stroke="#b6fe3b" strokeWidth="1.5" strokeLinecap="round"
                  strokeDasharray={`${RING_C} 9999`} strokeDashoffset={String(RING_C)}
                  transform="rotate(-90 109 109)"
                />
              </svg>
            )}

            {!expanded && !collapsing && <CircleMutedIcon />}
          </div>
        ) : <div className="playerMediaPlaceholder">Кружок не загружен</div>}
      </div>
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
