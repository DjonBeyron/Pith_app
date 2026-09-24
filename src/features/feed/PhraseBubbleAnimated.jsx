import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextSpoilerId, setSpoilerStat, clearSpoilerStat } from './spoilerStats.js'
import {
  MARGIN_X, MARGIN_Y, EXPLODE_MARGIN, EXPLODE_POWER_MIN, EXPLODE_POWER_MAX,
  buildGrid, drawFloat, drawExplode, renderStillImage,
} from './phraseBubbleDraw.js'

const EXPLODE_SAFETY_MS = 1500 // взрыв ~0.75с — с двойным запасом

// Шарики-спойлер поверх фразы модуля (замена blur+зерна) для способных
// устройств — на слабых и при prefers-reduced-motion вместо этого компонента
// монтируется PhraseBubbleStatic (см. PhraseBubbleSpoiler.jsx-переключатель).
// Плотная сетка мелких шариков почти полностью перекрывает текст и
// колышется поштучно (wiggle: две синусоиды + дыхание радиуса); тап — шарики
// разлетаются короткой вспышкой, текст открывается сразу по тапу (unlocked),
// канвас пропадает, когда шарики догорят (revealed). onUnlock зовётся в
// момент тапа — родитель может синхронно показать что-то ещё (FeedSlide:
// подпись выкатывается из-под фразы).
//
// CANVAS ЖИВЁТ ТОЛЬКО У АКТИВНОГО СЛАЙДА ВИДИМОЙ ЛЕНТЫ (live). Соседи в
// виртуальном окне, лента под уроком, «Мои уроки», профиль — везде вместо
// canvas одна статичная <img> (renderStillImage). Бисекция на iPhone
// показала, что даже спящие canvas-элементы (по одному на 5 слайдов, dpr=3)
// делали дёрганой системную анимацию сворачивания приложения — с любого
// экрана, потому что лента остаётся смонтированной под ними. А попытка
// заменить поштучный wiggle дрейфом групп-картинок читалась как «качаются
// слои точек» — поэтому на экране остаётся настоящий canvas, а не имитация.
//
// Подмена картинка ↔ canvas без скачка: картинка рисуется с ТЕКУЩИХ позиций
// шариков (drawFloat с dt=0), canvas стартует с тех же фаз; первый кадр —
// в useLayoutEffect, до показа. Плавание — 30 кадров/с (медленный дрейф
// неотличим от 60, а GPU занят вдвое меньше), взрыв — 60.
// Геометрия и отрисовка — phraseBubbleDraw.js.
export default function PhraseBubbleAnimated({ active, tabVisible = true, onUnlock, children }) {
  const live = active && tabVisible
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const bubblesRef = useRef([])
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const lastBuiltRef = useRef({ w: -1, h: -1 })
  const rafRef = useRef(0)
  const [still, setStill] = useState(null)       // { url, w, h } — картинка покоя
  const [exploding, setExploding] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const idRef = useRef(null)
  if (idRef.current === null) idRef.current = nextSpoilerId()

  const showCanvas = !revealed && (exploding || (live && !unlocked))
  const ready = !!still

  // Размонтирование: cleanup плавания не должен переснимать картинку покоя
  // (toDataURL — миллисекунды главного потока, при быстром скролле слайды
  // размонтируются пачками). Объявлен ДО эффекта плавания — cleanup'ы идут
  // в порядке объявления, флаг успевает упасть
  const mountedRef = useRef(true)
  useLayoutEffect(() => () => { mountedRef.current = false }, [])

  // Холст под размер из sizeRef (сброс width/height очищает контекст)
  function fitCanvas(canvas) {
    const { w, h, dpr } = sizeRef.current
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.style.left = -MARGIN_X + 'px'
    canvas.style.top = -MARGIN_Y + 'px'
  }

  // Отчёт в реестр DBG-панели (spoilerStats.js): шарики и живой ли холст
  useEffect(() => {
    if (revealed) { clearSpoilerStat(idRef.current); return }
    setSpoilerStat(idRef.current, bubblesRef.current.length, showCanvas)
    return () => clearSpoilerStat(idRef.current)
  }, [showCanvas, revealed, still])

  // Раскладка: сетка по размеру блока + картинка покоя. Пересчёт при ресайзе,
  // кроме взрыва (по тапу слова становятся кликабельными и текст чуть меняет
  // ширину — пересборка сетки в этот момент оборвала бы вспышку)
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || unlocked) return
    function layout() {
      const rect = wrap.getBoundingClientRect()
      const last = lastBuiltRef.current
      // ResizeObserver иногда шлёт субпиксельный шум — не пересобираем
      if (Math.abs(last.w - rect.width) < 2 && Math.abs(last.h - rect.height) < 2) return
      if (!rect.width || !rect.height) return
      lastBuiltRef.current = { w: rect.width, h: rect.height }
      const w = rect.width + MARGIN_X * 2
      const h = rect.height + MARGIN_Y * 2
      // Полный DPR (до 3): на Retina шарики радиусом 1-2px иначе смазаны
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      sizeRef.current = { w, h, dpr }
      bubblesRef.current = buildGrid(rect.width, rect.height)
      setStill({ url: renderStillImage(bubblesRef.current, w, h, dpr), w, h })
      // Живой холст уже на экране — подгоняем размер, следующий кадр цикла
      // дорисует. Во время взрыва сюда не попасть: unlocked снимает наблюдатель
      const canvas = canvasRef.current
      if (canvas) fitCanvas(canvas)
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [unlocked])

  // Плавание на живом холсте. При уходе (слайд не активен / лента скрыта /
  // взрыв) — цикл гасим и переснимаем картинку покоя с текущих позиций
  // Зависимость — ready (есть ли картинка), а не сам still: cleanup сам
  // переснимает still, и зависимость от объекта зациклила бы эффект
  useLayoutEffect(() => {
    if (!live || unlocked || exploding || !ready) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // Размер читаем из sizeRef на каждом кадре: ресайз меняет его (и холст) на лету
    const draw = dt => {
      const { w, h, dpr } = sizeRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      drawFloat(ctx, bubblesRef.current, dt)
    }
    fitCanvas(canvas)
    draw(0)

    let last = performance.now()
    let skip = 0
    function frame(now) {
      rafRef.current = requestAnimationFrame(frame)
      skip ^= 1
      if (skip) return
      const dt = Math.min(48, now - last)
      last = now
      draw(dt)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (!mountedRef.current) return
      // Слайд ушёл с экрана: картинка покоя — с тех позиций, где шарики
      // остановились, чтобы возврат canvas продолжил движение без скачка
      setStill(s => s ? { ...s, url: renderStillImage(bubblesRef.current, s.w, s.h, sizeRef.current.dpr) } : s)
    }
  }, [live, unlocked, exploding, ready])

  // Взрыв на том же холсте: первый кадр — до показа, в том же тике открываем текст
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
    // Страховка: взрыв длится ~0.75с; если кадры встали (фон, троттлинг),
    // холст всё равно убираем — иначе он висел бы поверх строки перевода
    const safety = setTimeout(() => setRevealed(true), EXPLODE_SAFETY_MS)
    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(safety) }
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
      {/* Во время взрыва холст на 120px шире фразы со всех сторон и лежит
          поверх строки «перевести» — касания он не ловит (иначе на Android
          тап по переводу уходил в холст, пока шарики разлетаются) */}
      {showCanvas && (
        <canvas className={exploding ? 'phraseBubbleCanvas phraseBubbleCanvasExploding' : 'phraseBubbleCanvas'}
          ref={canvasRef} aria-hidden="true" />
      )}
      {!showCanvas && !unlocked && still && (
        <img
          className="phraseBubbleStill" src={still.url} alt="" draggable={false} aria-hidden="true"
          style={{ left: -MARGIN_X, top: -MARGIN_Y, width: still.w, height: still.h }}
        />
      )}
    </div>
  )
}
