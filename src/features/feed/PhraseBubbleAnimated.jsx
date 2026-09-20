import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextSpoilerId, setSpoilerStat, clearSpoilerStat } from './spoilerStats.js'
import {
  MARGIN_X, MARGIN_Y, EXPLODE_MARGIN, EXPLODE_POWER_MIN, EXPLODE_POWER_MAX,
  buildGrid, drawExplode, renderLayerImages,
} from './phraseBubbleDraw.js'

// Шарики-спойлер поверх фразы модуля (замена blur+зерна) для способных
// устройств — на слабых и при prefers-reduced-motion вместо этого компонента
// монтируется PhraseBubbleStatic (см. PhraseBubbleSpoiler.jsx-переключатель).
// Плотная сетка мелких шариков почти полностью перекрывает текст и
// колышется; тап — шарики разлетаются короткой вспышкой, текст открывается
// сразу по тапу (unlocked), канвас взрыва пропадает, когда шарики догорят
// (revealed). onUnlock зовётся в момент тапа — родитель может синхронно
// показать что-то ещё (см. FeedSlide: подпись выкатывается из-под фразы).
//
// В ПОКОЕ CANVAS В DOM НЕТ. Сетка рисуется один раз в невидимый canvas и
// превращается в три <img> (группы шариков через одну), которые дрейфуют
// CSS-анимацией transform (feed-bubble-spoiler.css) — на композиторе, без
// JS в кадре. Раньше на каждом из 5 слайдов виртуального окна жил свой
// <canvas> с rAF-циклом: ~1000-1800 кружков на dpr=3 каждый кадр держали
// GPU занятым (Chrome: 35% Scripting в покое), а бисекция на iPhone
// показала, что даже НЕанимирующие canvas-элементы делали дёрганой системную
// анимацию сворачивания приложения — с любого экрана, включая урок, под
// которым лента остаётся смонтированной. Со статичной заглушкой лаг исчезал
// полностью — отсюда и решение: canvas только на 0.75с взрыва.
//
// Дрейф идёт только у активного слайда видимой ленты (live); у остальных
// анимация на паузе (animation-play-state) — без скачка в момент, когда
// слайд становится активным. Геометрия и отрисовка — phraseBubbleDraw.js.
export default function PhraseBubbleAnimated({ active, tabVisible = true, onUnlock, children }) {
  const live = active && tabVisible
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const bubblesRef = useRef([])
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const lastBuiltRef = useRef({ w: -1, h: -1 })
  const rafRef = useRef(0)
  const [layers, setLayers] = useState(null)     // { urls, w, h } — картинки групп и размер слоя
  const [exploding, setExploding] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const idRef = useRef(null)
  if (idRef.current === null) idRef.current = nextSpoilerId()

  // Отчёт в реестр DBG-панели (spoilerStats.js): сколько шариков у ЭТОГО
  // спойлера и дрейфует ли он сейчас
  useEffect(() => {
    if (revealed) { clearSpoilerStat(idRef.current); return }
    setSpoilerStat(idRef.current, bubblesRef.current.length, live)
    return () => clearSpoilerStat(idRef.current)
  }, [live, revealed, layers])

  // Раскладка: сетка по размеру блока → три картинки. Пересчёт при ресайзе,
  // кроме взрыва (по тапу слова становятся кликабельными и текст чуть меняет
  // ширину — пересборка сетки в этот момент оборвала бы вспышку)
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || unlocked) return
    function layout() {
      const rect = wrap.getBoundingClientRect()
      const last = lastBuiltRef.current
      // ResizeObserver иногда шлёт субпиксельный шум — не перерисовываем
      if (Math.abs(last.w - rect.width) < 2 && Math.abs(last.h - rect.height) < 2) return
      if (!rect.width || !rect.height) return
      lastBuiltRef.current = { w: rect.width, h: rect.height }
      const w = rect.width + MARGIN_X * 2
      const h = rect.height + MARGIN_Y * 2
      // Полный DPR (до 3): на Retina шарики радиусом 1-2px иначе смазаны
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      sizeRef.current = { w, h, dpr }
      bubblesRef.current = buildGrid(rect.width, rect.height)
      setLayers({ urls: renderLayerImages(bubblesRef.current, w, h, dpr), w, h })
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [unlocked])

  // Взрыв: canvas монтируется только на его время. useLayoutEffect — первый
  // кадр рисуем ДО показа (частицы ещё на своих местах), в том же тике
  // прячем картинки и открываем текст: подмены картинок на холст глазом не видно
  useLayoutEffect(() => {
    if (!exploding) return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const rect = wrap.getBoundingClientRect()
    const dpr = sizeRef.current.dpr || 1
    // Запас пошире (EXPLODE_MARGIN вместо MARGIN_X/Y), иначе шарикам некуда лететь
    const w = rect.width + EXPLODE_MARGIN * 2
    const h = rect.height + EXPLODE_MARGIN * 2
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.style.left = -EXPLODE_MARGIN + 'px'
    canvas.style.top = -EXPLODE_MARGIN + 'px'
    const shiftX = EXPLODE_MARGIN - MARGIN_X
    const shiftY = EXPLODE_MARGIN - MARGIN_Y
    const cx = w / 2, cy = h / 2
    const bubbles = bubblesRef.current
    for (const b of bubbles) {
      // Мутируем частицы в ref намеренно — это mutable-состояние canvas-анимации
      // eslint-disable-next-line react-hooks/immutability
      b.ax += shiftX
      b.ay += shiftY
      const angle = Math.atan2(b.ay - cy, b.ax - cx) + (Math.random() - 0.5) * 0.7
      const power = EXPLODE_POWER_MIN + Math.random() * (EXPLODE_POWER_MAX - EXPLODE_POWER_MIN)
      b.vx = Math.cos(angle) * power
      b.vy = Math.sin(angle) * power - 2
      b.t = 0
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawExplode(ctx, bubbles, 0, w, h)
    setUnlocked(true)
    onUnlock?.()

    let last = performance.now()
    function frame(now) {
      const dt = Math.min(32, now - last)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (drawExplode(ctx, bubbles, dt, w, h)) { setRevealed(true); return }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
    // onUnlock — колбэк родителя, зовётся один раз в момент тапа
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploding])

  function explode() {
    if (exploding || unlocked) return
    setExploding(true)
  }

  return (
    <div className="phraseBubbleWrap" ref={wrapRef} onClick={explode}>
      {/* Текст спрятан (visibility, не display) до тапа — сам текст
          блокирован, а не просто прикрыт сверху. Открывается сразу по тапу */}
      <div className={unlocked ? 'phraseBubbleText' : 'phraseBubbleText phraseBubbleTextHidden'}>
        {children}
      </div>
      {!unlocked && layers && (
        <div
          className={live ? 'phraseBubbleLayers phraseBubbleLayersLive' : 'phraseBubbleLayers'}
          style={{ left: -MARGIN_X, top: -MARGIN_Y, width: layers.w, height: layers.h }}
          aria-hidden="true"
        >
          {layers.urls.map((src, i) => (
            <img key={i} src={src} className={`phraseBubbleLayer phraseBubbleLayer${i}`} alt="" draggable={false} />
          ))}
        </div>
      )}
      {exploding && !revealed && (
        <canvas className="phraseBubbleCanvas" ref={canvasRef} aria-hidden="true" />
      )}
    </div>
  )
}
