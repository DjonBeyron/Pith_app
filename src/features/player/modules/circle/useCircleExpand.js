import { useState, useRef, useEffect } from 'react'
import { getLessonMuted } from '../../lessonVolume.js'

const EDGE_GAP = 24
// Одна кривая и длительность на всё: сам кружок (.circleWrap, circle.css — те же 0.24s и кривая) и сдвиг сообщений
// истории выше него. Рассинхрона по таймингу нет по построению
export const CIRCLE_ANIM_MS = 240
export const CIRCLE_ANIM_EASE = 'cubic-bezier(0.4,0,1,1)'
const ROW_TRANSITION = `transform ${CIRCLE_ANIM_MS}ms ${CIRCLE_ANIM_EASE}`
const NO_VIDEO = { current: null } // кружок без <video> (нода scene): видео-ветки ниже пропускаются
const NO_DONE = { current: true }
const NOOP = () => {}

export function getSmallPx() {
  return Math.min(window.innerWidth * 0.5, 200)
}

// Сдвиг сообщений истории выше кружка. Анимируем (transition + слой композитора) только те строки, что реально видны
// в рамке плеера ± сдвиг: в длинном чате выше кружка десятки строк, и transform с transition на каждой делал из них
// отдельные слои — на слабом Android это лишние десятки текстур/растеров на каждый тап. Остальные (за экраном) получают то
// же значение мгновенно, без transition: глазом не видно, слоя нет. Чтение прямоугольников — одной пачкой до записей стилей.
// transform: строка значения ('' — вернуть на место).
export function moveHistoryRows(rows, transform, { top, bottom, spread }) {
  const rects = rows.map(el => el.getBoundingClientRect())
  const animated = []
  rows.forEach((el, i) => {
    const r = rects[i]
    const visible = r.bottom > top - spread && r.top < bottom + spread
    if (visible) { el.style.willChange = 'transform'; el.style.transition = ROW_TRANSITION; animated.push(el) }
    else el.style.transition = 'none'
    el.style.transform = transform
  })
  return animated
}

// will-change живёт только на время анимации: после неё слой отпускается, и браузер перерастеризует кружок в итоговом
// масштабе (с вечным will-change картинка осталась бы размытой, растянутой из маленькой текстуры)
function releaseLayers(els) {
  els.forEach(el => { if (el) el.style.willChange = '' })
}

// Раскрытие кружка на весь экран по тапу и обратно (свайпом вниз или тапом
// по фону): геометрия анимации (куда расти, на сколько сдвинуть соседние
// сообщения — FLIP-техника через MutationObserver) + собственно состояние
// expanded/collapsing. Вынесено из CircleModule.jsx — там же остаются
// воспроизведение видео и звуковая логика (handlePlaying/handleEnded).
// Кружок сцены (SceneCircleView) берёт ту же механику без видео: vRef/doneFiredRef/stopRaf не нужны,
// а о раскрытии/закрытии сообщают onExpand/onCollapse (там — пуск/звук режиссёра сцены).
export function useCircleExpand({
  wrapRef, vRef = NO_VIDEO, dims, bottomOffset, doneFiredRef = NO_DONE, stopRaf = NOOP, onDone, onExpand, onCollapse,
}) {
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
  const animRowsRef   = useRef([])
  const releaseTimer  = useRef(null)
  const touchStartY   = useRef(0)

  // Через время анимации снимаем will-change с кружка и анимированных строк
  function scheduleRelease() {
    if (releaseTimer.current) clearTimeout(releaseTimer.current)
    releaseTimer.current = setTimeout(() => {
      releaseTimer.current = null
      releaseLayers([wrapRef.current, ...animRowsRef.current])
      animRowsRef.current = []
    }, CIRCLE_ANIM_MS + 80)
  }

  function handleTap() {
    if (animatingRef.current || collapseTimer.current) return
    // Block tap while feed is animating new messages (190ms slide-in)
    const feedInner = wrapRef.current?.closest('.playerFeedInner')
    if (feedInner) {
      const feedAnimating = [feedInner, ...feedInner.querySelectorAll('.playerMsgRow')]
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
    const boxTop    = box?.top    ?? 0
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

    wrapRef.current.style.willChange = 'transform'
    if (inner) {
      const rows = [...inner.querySelectorAll('.playerMsgRow')]
      const idx = rows.indexOf(row)
      const prev = rows.slice(0, idx)
      prevRowsRef.current = prev
      animRowsRef.current = moveHistoryRows(prev, `translateY(-${halfGrow}px)`, { top: boxTop, bottom: boxBottom, spread: halfGrow })

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
    scheduleRelease()

    setExpandTransform(ty !== 0
      ? `translateX(${tx}px) translateY(${ty}px) scale(${ratio})`
      : `translateX(${tx}px) scale(${ratio})`)
    setExpanded(true)
    expandedRef.current = true
    animatingRef.current = true
    setTimeout(() => { animatingRef.current = false }, 300)
    onExpand?.()

    const v = vRef.current
    if (v) {
      v.pause()
      v.loop = false
      v.currentTime = 0
    }

    setTimeout(() => {
      const v2 = vRef.current
      if (!v2 || !expandedRef.current) return
      v2.muted = getLessonMuted() // «без звука» в шапке урока — раскрытый кружок немой
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
    onCollapse?.()

    if (!doneFiredRef.current) {
      const v = vRef.current
      const watched = v?.duration ? v.currentTime / v.duration : 0
      if (watched >= 0.2) {
        doneFiredRef.current = true
        onDone?.()
      }
    }

    if (flipObserver.current) { flipObserver.current.disconnect(); flipObserver.current = null }
    if (wrapRef.current) wrapRef.current.style.willChange = 'transform'
    const stage = wrapRef.current?.closest('.lessonPlayer')?.getBoundingClientRect()
    animRowsRef.current = moveHistoryRows(prevRowsRef.current, '', {
      top: stage?.top ?? 0, bottom: stage?.bottom ?? window.innerHeight, spread: halfGrowRef.current,
    })
    prevRowsRef.current = []
    scheduleRelease()

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
    if (releaseTimer.current) clearTimeout(releaseTimer.current)
    if (flipObserver.current) { flipObserver.current.disconnect(); flipObserver.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { expanded, collapsing, expandTransform, expandedRef, handleTap, collapse, onTouchStart, onTouchEnd }
}
