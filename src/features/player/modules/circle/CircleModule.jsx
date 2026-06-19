import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { pLog } from '../../../../shared/lib/debug.js'

const RING_R = 106
const RING_C = 2 * Math.PI * RING_R   // circumference in SVG units

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
  const [intr,   setIntr]   = useState(null)
  const [dims,   setDims]   = useState(null)
  const [fs,     setFs]     = useState(false)
  const [fintr,  setFintr]  = useState(null)
  const [fdims,  setFdims]  = useState(null)
  const [fring,  setFring]  = useState(true)
  const [fready, setFready] = useState(false)

  const crop    = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }
  const frRef   = useRef(null), vRef    = useRef(null)
  const fsfrRef = useRef(null), fsvRef  = useRef(null)
  const spRef   = useRef(null), arcRef  = useRef(null)

  useEffect(() => {
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const src = objectUrl ?? file?.r2Url ?? node.typeData?.circle?.r2Url ?? null
  useEffect(() => { setIntr(null); setFintr(null) }, [src])

  useLayoutEffect(() => {
    const el = frRef.current; if (!el) return
    setDims({ w: el.clientWidth, h: el.clientHeight })
  }, [src])

  useLayoutEffect(() => {
    if (!fs) return
    const el = fsfrRef.current; if (!el) return
    setFdims({ w: el.clientWidth, h: el.clientHeight })
  }, [fs, src])

  const circleDoneFiredRef = useRef(false)

  useEffect(() => {
    pLog('CircleModule mount — src=', src ?? 'NULL', 'onDone=', typeof onDone)
  }, [src]) // eslint-disable-line

  // Inline: first play with sound → silent infinite loop (no ring)
  function onEnd() {
    pLog('CircleModule onEnd — fired=', circleDoneFiredRef.current, 'onDone=', typeof onDone)
    if (!circleDoneFiredRef.current) {
      circleDoneFiredRef.current = true
      pLog('CircleModule: calling onDone()')
      onDone?.()
    }
    const v = vRef.current; if (!v) return
    v.muted = true
    v.loop  = true
    v.play()
  }

  // Fullscreen: direct DOM update for perfect sync, no React re-render per frame
  function onFsTU(e) {
    const v = e.currentTarget
    if (!v.duration || !arcRef.current) return
    const p = v.currentTime / v.duration
    arcRef.current.style.strokeDashoffset = String(RING_C * (1 - p))
  }

  function onFsEnd() {
    setFring(false)
    const v = fsvRef.current; if (!v) return
    setTimeout(() => {
      if (arcRef.current) arcRef.current.style.strokeDashoffset = RING_C
      setFring(true)
      v.currentTime = 0
      v.play()
    }, 350)
  }

  function openFs() {
    const v = vRef.current; if (v) v.pause()
    setFring(true); setFready(false); setFs(true)
    if (arcRef.current) arcRef.current.style.strokeDashoffset = RING_C
  }
  function closeFs() {
    setFs(false); setFintr(null); setFdims(null)
    const v = vRef.current; if (v) v.play()
  }

  return (
    <div className="playerMsgRow playerMsgRowCircle">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--circle">
        {src ? (
          <>
            <div className="circleWrap" onClick={openFs}>
              <div ref={frRef} className="circleFrame">
                <video ref={vRef} src={src} className="circleMedia" style={calcStyle(intr, dims, crop)}
                  playsInline autoPlay muted onEnded={onEnd}
                  onPlay={e => { e.currentTarget.muted = false }}
                  onLoadedMetadata={e => setIntr({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                />
              </div>
            </div>
            {fs && (
              <div className="circleFullOverlay" onClick={closeFs}>
                <button className="circleFullClose" onClick={e => { e.stopPropagation(); closeFs() }}>×</button>
                <div ref={spRef} className="videoFullSpinner" />
                <div className={`circleFullWrap${fready ? ' circleFullWrapOn' : ''}`} onClick={e => e.stopPropagation()}>
                  <div ref={fsfrRef} className="circleFullFrame">
                    <video ref={fsvRef} src={src} className="circleMedia" style={calcStyle(fintr, fdims, crop)}
                      playsInline autoPlay
                      onCanPlay={() => { setFready(true); if (spRef.current) spRef.current.style.display = 'none' }}
                      onTimeUpdate={onFsTU} onEnded={onFsEnd}
                      onLoadedMetadata={e => setFintr({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                    />
                  </div>
                  <svg className="circleRingSvg" viewBox="0 0 218 218" aria-hidden="true">
                    <circle cx="109" cy="109" r={RING_R} fill="none"
                      stroke="rgba(255,255,255,.15)" strokeWidth="3"
                    />
                    <circle ref={arcRef} cx="109" cy="109" r={RING_R} fill="none"
                      stroke="#b6fe3b" strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${RING_C} 9999`} strokeDashoffset={RING_C}
                      transform="rotate(-90 109 109)"
                      style={{ opacity: fring ? 1 : 0, transition: 'opacity .35s' }}
                    />
                  </svg>
                </div>
              </div>
            )}
          </>
        ) : <div className="playerMediaPlaceholder">Кружок не загружен</div>}
      </PlayerBubble>
    </div>
  )
}
