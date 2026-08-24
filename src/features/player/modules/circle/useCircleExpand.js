import { useState, useRef, useEffect } from 'react'

const EDGE_GAP = 24

export function getSmallPx() {
  return Math.min(window.innerWidth * 0.5, 200)
}

// Раскрытие кружка на весь экран по тапу и обратно (свайпом вниз или тапом
// по фону): геометрия анимации (куда расти, на сколько сдвинуть соседние
// сообщения — FLIP-техника через MutationObserver) + собственно состояние
// expanded/collapsing. Вынесено из CircleModule.jsx — там же остаются
// воспроизведение видео и звуковая логика (handlePlaying/handleEnded).
export function useCircleExpand({ wrapRef, vRef, dims, bottomOffset, doneFiredRef, stopRaf, onDone }) {
  const [expanded, setExpanded] = useState(false)
  const [collapsing, setCollapsing] = useState(false)
  const [expandTransform, setExpandTransform] = useState(null)

  const expandedRef   = useRef(false)
  const animatingRef  = useRef(false)
  const expandWRef    = useRef(0)
  const halfGrowRef   = useRef(0)
  const prevRowsRef   = useRef([])
  const flipObserver  = useRef(null)
  const collapseTimer = useRef(null)
  const touchStartY   = useRef(0)

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

    // Границы раскрытия — рамка плеера, а не окно: на телефоне .lessonPlayer
    // и так во весь экран (цифры те же, что были), на десктопе плеер живёт в
    // «телефоне» 420px, и по окну кружок раздувался на весь монитор
    const stage = wrapRef.current.closest('.lessonPlayer')
    const box = stage ? stage.getBoundingClientRect() : null
    const boxLeft   = box?.left   ?? 0
    const boxBottom = box?.bottom ?? window.innerHeight
    const boxWidth  = box?.width  ?? window.innerWidth

    const row = wrapRef.current.closest('.playerMsgRow')
    // Each .playerMsgRow is wrapped in a key-div; go up to playerFeedInner
    const inner = row?.closest('.playerFeedInner')
    const rowWrapper = row?.parentElement
    const nextWrapper = rowWrapper?.nextElementSibling
    const nextRow = nextWrapper?.querySelector('.playerMsgRow') ?? null
    let nextMsgTop = boxBottom
    if (nextRow) {
      const visualTop = nextRow.getBoundingClientRect().top
      if (visualTop <= boxBottom) {
        nextMsgTop = visualTop
      } else {
        const innerTop = inner ? inner.getBoundingClientRect().top : 0
        nextMsgTop = innerTop + (nextWrapper?.offsetTop ?? 0)
      }
    }
    const bottomLimit = Math.min(boxBottom - bottomOffset, nextMsgTop) - EDGE_GAP

    const expandW = boxWidth - EDGE_GAP * 2
    const ratio = expandW / s
    const ty = Math.min(0, bottomLimit - (centerY + expandW / 2))
    const visualLeft = rect.left - s * (ratio - 1) / 2
    const tx = boxLeft + EDGE_GAP - visualLeft
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { expanded, collapsing, expandTransform, expandedRef, handleTap, collapse, onTouchStart, onTouchEnd }
}
