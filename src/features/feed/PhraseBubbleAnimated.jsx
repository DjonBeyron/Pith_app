import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextSpoilerId, setSpoilerStat, clearSpoilerStat } from './spoilerStats.js'
import { drawFloat, renderStillImage } from './phraseBubbleDraw.js'
import { buildGrid } from './phraseBubbleGrid.js'
import { MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'
import { hasExplode, regionsKey, needsRebuild } from './phraseBubbleRegions.js'
import { usePhraseBubbleExplode } from './usePhraseBubbleExplode.js'

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
//
// Режим «Ловли слов» (catch/CatchStripPhrase): onTap(e) — задан → тап НЕ взрывает, а отдаётся родителю (он ищет
// слово по координате); explode — команда на взрыв: true — всё сразу, число n — взорваны первые n облачков, массив —
// индексы взорванных (usePhraseBubbleExplode.js); текст открывается с первого взрыва. regions — прямоугольники слов
// { x, y, w, h } относительно текстового блока: шарики лежат отдельными облачками над словами (buildGrid), между
// словами промежуток чистый; пересборка сетки при смене regions. Без regions — одна сплошная масса, как в ленте.
export default function PhraseBubbleAnimated({ active, tabVisible = true, onUnlock, onTap, explode = false, regions = null, children }) {
  const live = active && tabVisible
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const bubblesRef = useRef([])
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const lastBuiltRef = useRef(null) // { w, h, sig } последней сборки сетки (needsRebuild)
  const rafRef = useRef(0)
  const [still, setStill] = useState(null)       // { url, w, h } — картинка покоя
  const [exploding, setExploding] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const idRef = useRef(null)
  if (idRef.current === null) idRef.current = nextSpoilerId()

  // Внешняя команда «взорвись» (проп explode): переход ловим при рендере (не в эффекте — правило react-hooks).
  // Тап (без onTap) взрывает всё сразу: tapped → команда true
  const [tapped, setTapped] = useState(false)
  const command = tapped ? true : explode
  if (hasExplode(command) && !exploding && !unlocked) setExploding(true)

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
  const regionsSig = regionsKey(regions)
  const regionsRef = useRef(regions)
  useLayoutEffect(() => { regionsRef.current = regions }) // раньше сборки сетки ниже: эффекты идут по порядку
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || unlocked) return
    function layout() {
      const rect = wrap.getBoundingClientRect()
      // Пересборка — при другом наборе регионов (даже если размер блока тот же: сетка без регионов — сплошная масса)
      // или заметной смене размера (ResizeObserver иногда шлёт субпиксельный шум — его needsRebuild не считает)
      const next = { w: rect.width, h: rect.height, sig: regionsSig }
      if (!needsRebuild(lastBuiltRef.current, next)) return
      lastBuiltRef.current = next
      const w = rect.width + MARGIN_X * 2
      const h = rect.height + MARGIN_Y * 2
      // Полный DPR (до 3): на Retina шарики радиусом 1-2px иначе смазаны
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      sizeRef.current = { w, h, dpr }
      bubblesRef.current = buildGrid(rect.width, rect.height, regionsRef.current)
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
  }, [unlocked, regionsSig])

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
      const dt = Math.max(0, Math.min(48, now - last))
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

  // Взрыв на том же холсте (команда — проп explode или тап)
  usePhraseBubbleExplode({
    exploding, explode: command, wrapRef, canvasRef, bubblesRef, sizeRef, setUnlocked, setRevealed, onUnlock,
  })

  // Тап: с onTap — решает родитель (слово по координате), иначе взрыв
  function tap(e) {
    if (onTap) { onTap(e); return }
    if (exploding || unlocked) return
    setTapped(true)
  }

  return (
    <div className="phraseBubbleWrap" ref={wrapRef} onClick={tap}>
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
