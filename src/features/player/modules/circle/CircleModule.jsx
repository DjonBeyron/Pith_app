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

export default function CircleModule({ node, file, onDone }) {
  const [objectUrl, setObjectUrl]   = useState(null)
  const [intr, setIntr]             = useState(null)
  const [dims, setDims]             = useState(null)
  const [expanded, setExpanded]     = useState(false)
  const [collapsing, setCollapsing] = useState(false)
  const [expandTransform, setExpandTransform] = useState(null)

  const crop = node.typeData?.circle?.crop ?? { x: 0, y: 0, scale: 1 }

  const vRef          = useRef(null)
  const wrapRef       = useRef(null)
  const frRef         = useRef(null)
  const arcRef        = useRef(null)
  const rafRef        = useRef(null)  // не используется, оставлен для stopRaf()
  const collapseTimer = useRef(null)
  const touchStartY   = useRef(0)
  const doneFiredRef  = useRef(false)
  const expandedRef   = useRef(false)
  const animatingRef  = useRef(false)  // защита от частых тапов во время анимации
  const expandWRef    = useRef(0)
  const halfGrowRef   = useRef(0)
  const prevRowsRef   = useRef([])  // .playerMsgRow элементы выше кружка — сдвигаем translateY
  const flipObserver  = useRef(null) // MutationObserver: переприменяет lift после PlayerFeed FLIP

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

  useEffect(() => {
    pLog('CircleModule STATE: expanded=', expanded, 'collapsing=', collapsing)
  }, [expanded, collapsing])

  function handleEnded() {
    if (!expandedRef.current) return
    // Повторный просмотр — зациклить, не выходить
    if (doneFiredRef.current) {
      pLog('CircleModule: expanded ended, revisit → loop from start')
      const v = vRef.current
      if (v) { v.currentTime = 0; v.play().catch(() => {}) }
      stopRingAnimation()
      if (v?.duration) startRingAnimation(v.duration)
      return
    }
    doneFiredRef.current = true
    // Доводим кольцо до 100% принудительно — CSS animation может чуть не успеть
    if (arcRef.current) {
      arcRef.current.style.animation = 'none'
      arcRef.current.style.strokeDashoffset = '0'
    }
    pLog('CircleModule: expanded video ended → onDone + collapse')
    onDone?.()
    collapse()
  }

  function handlePlaying() {
    // playing = видео реально пошло (после буферизации) — стартуем кольцо точно отсюда
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

  // stopRaf оставлен для совместимости с useEffect cleanup
  function stopRaf() { stopRingAnimation() }

  function handleTap() {
    // Блокируем тап если идёт expand-анимация (animatingRef) ИЛИ collapse-анимация (collapseTimer)
    if (animatingRef.current || collapseTimer.current) return
    if (expandedRef.current) { collapse(); return }

    const s = dims?.w ?? getSmallPx()
    const rect = wrapRef.current.getBoundingClientRect()
    const centerY = rect.top + s / 2

    // Нижняя граница: следующее сообщение под кружком или дно экрана.
    // Если nextRow уже на экране → берём визуальную позицию (getBoundingClientRect).
    // Если nextRow ещё анимируется снизу (top > innerHeight) → берём layout-позицию
    // (offsetTop + top контейнера) — финальное место куда приедет сообщение.
    const row = wrapRef.current.closest('.playerMsgRow')
    const nextRow = row?.nextElementSibling
    let nextMsgTop = window.innerHeight
    if (nextRow) {
      const visualTop = nextRow.getBoundingClientRect().top
      if (visualTop <= window.innerHeight) {
        nextMsgTop = visualTop
      } else {
        const innerEl = row.parentElement
        const innerTop = innerEl ? innerEl.getBoundingClientRect().top : 0
        nextMsgTop = innerTop + nextRow.offsetTop
      }
    }
    const bottomLimit = Math.min(window.innerHeight, nextMsgTop) - EDGE_GAP

    // Размер всегда полная ширина — кружок большой при любом положении
    const expandW = window.innerWidth - EDGE_GAP * 2
    const ratio = expandW / s

    // Если кружок внизу и его визуальный низ выходит за bottomLimit →
    // сдвигаем вверх через translateY (ty ≤ 0). Иначе ty = 0.
    const ty = Math.min(0, bottomLimit - (centerY + expandW / 2))

    // translateX: выравниваем левый край по EDGE_GAP
    const visualLeft = rect.left - s * (ratio - 1) / 2
    const tx = EDGE_GAP - visualLeft

    // halfGrow: на сколько вырос верх кружка — нужно для margin-top чата
    // (expandW-s)/2 — рост вверх от центра, -ty — дополнительный сдвиг вверх
    const halfGrow = (expandW - s) / 2 - ty

    pLog('CircleModule expand: s=', s, 'expandW=', Math.round(expandW),
      'ty=', Math.round(ty), 'halfGrow=', Math.round(halfGrow),
      'bottomLimit=', Math.round(bottomLimit), 'ratio=', ratio.toFixed(3))

    doneFiredRef.current = false
    expandWRef.current = expandW
    halfGrowRef.current = halfGrow

    // Сдвигаем предыдущие строки чата вверх через GPU transform (синхронно с expand кружка)
    const inner = row?.parentElement
    if (inner) {
      const rows = [...inner.querySelectorAll('.playerMsgRow')]
      const idx = rows.indexOf(row)
      const prev = rows.slice(0, idx)
      prevRowsRef.current = prev
      prev.forEach(el => {
        el.style.transition = 'transform 0.24s cubic-bezier(0.4,0,0.2,1)'
        el.style.transform = `translateY(-${halfGrow}px)`
      })

      // PlayerFeed FLIP сбрасывает transforms при добавлении новых строк.
      // MutationObserver переприменяет lift после FLIP (400ms).
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
    setTimeout(() => { animatingRef.current = false }, 300)  // анимация 0.24s + запас

    // Сразу: пауза + первый кадр — виден во время анимации расширения
    const v = vRef.current
    if (v) {
      v.pause()
      v.loop = false
      v.currentTime = 0
    }

    // После анимации expand: play со звуком. Кольцо стартует по событию playing.
    setTimeout(() => {
      const v2 = vRef.current
      if (!v2 || !expandedRef.current) return
      v2.muted = false
      v2.play()
        .then(() => pLog('CircleModule: expanded play OK'))
        .catch(err => {
          pLog('CircleModule: unmuted play failed:', err.message, '→ stay muted')
          v2.muted = true
          v2.loop = true
          v2.play().catch(() => {})
        })
    }, 260)
  }

  function collapse() {
    pLog('CircleModule collapse: expanded=', expandedRef.current)
    stopRaf()

    // Если пользователь вышел вручную (не по ended) — проверяем сколько посмотрел.
    // >20% → считаем что досмотрел, сразу вызываем onDone.
    if (!doneFiredRef.current) {
      const v = vRef.current
      const watched = v?.duration ? v.currentTime / v.duration : 0
      pLog('CircleModule collapse: watched=', Math.round(watched * 100) + '%')
      if (watched >= 0.2) {
        doneFiredRef.current = true
        pLog('CircleModule: watched >20% on manual collapse → onDone')
        onDone?.()
      }
    }

    // Возвращаем предыдущие строки на место
    if (flipObserver.current) { flipObserver.current.disconnect(); flipObserver.current = null }
    prevRowsRef.current.forEach(el => {
      el.style.transition = 'transform 0.24s cubic-bezier(0.4,0,0.2,1)'
      el.style.transform = ''
    })
    prevRowsRef.current = []

    expandedRef.current = false
    setExpanded(false)
    setCollapsing(true)
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null
      pLog('CircleModule: collapsing timer done')
      setCollapsing(false)
      setExpandTransform(null)
    }, 500)

    const v = vRef.current
    if (v) {
      v.loop = true
      v.muted = true
      v.currentTime = 0
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
    if (flipObserver.current) { flipObserver.current.disconnect(); flipObserver.current = null }
  }, [])

  const s = dims?.w ?? getSmallPx()
  // Предыдущие строки двигаются через translateY напрямую (GPU, синхронно с кружком).
  // Кружок сам только transform + zIndex — никакого margin-top.
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
                ref={vRef} src={src} className="circleMedia"
                style={videoStyle}
                playsInline autoPlay muted loop preload="auto"
                onLoadedMetadata={e => {
                  const v = e.currentTarget
                  setIntr({ w: v.videoWidth, h: v.videoHeight })
                  pLog('CircleModule meta:', v.videoWidth, 'x', v.videoHeight)
                }}
                onCanPlay={() => pLog('CircleModule canPlay expanded=', expandedRef.current)}
                onWaiting={() => pLog('CircleModule WAITING expanded=', expandedRef.current)}
                onStalled={() => pLog('CircleModule STALLED expanded=', expandedRef.current)}
                onPlaying={handlePlaying}
                onEnded={handleEnded}
                onError={e => pLog('CircleModule onError', e.currentTarget.error?.code)}
              />
            </div>

            {/* Кольцо всегда в DOM — без условного mount нет мерцания на старте.
                На expand: появляется с задержкой 0.15s (уже во время анимации).
                На collapse: мгновенно прячется (delay 0). */}
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

            {/* Значок без звука: всегда в DOM, плавно появляется после collapse */}
            <div className="circleMutedIcon" style={{
              opacity: (!expanded && !collapsing) ? 1 : 0,
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
        ) : <div className="playerMediaPlaceholder">Кружок не загружен</div>}
      </div>
    </div>
  )
}

