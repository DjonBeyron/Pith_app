import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextSpoilerId, setSpoilerStat, clearSpoilerStat, countRebuild, countStill } from './spoilerStats.js'
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
// Картинка покоя (renderStillImage → toDataURL, миллисекунды главного потока) снимается ТОЛЬКО когда холста нет: при
// засыпании живого холста и при сборке сетки, пока на экране картинка. Пока холст живой, пересборка сетки (смена
// regions/размера) картинку не снимает — url остаётся null до засыпания.
//
// Режим «Ловли слов» (catch/CatchStripPhrase): onTap(e) — задан → тап НЕ взрывает, а отдаётся родителю (он ищет
// слово по координате); explode — команда на взрыв: true — всё сразу, число n — взорваны первые n облачков, массив —
// индексы взорванных (usePhraseBubbleExplode.js); текст открывается с первого взрыва. regions — прямоугольники слов
// { x, y, w, h } относительно текстового блока: шарики лежат отдельными облачками над словами (buildGrid), между
// словами промежуток чистый; пересборка сетки при смене regions (не сразу, а раз за кадр: несколько смен подряд —
// одна сборка; пока regions — пустой массив, слова ещё не измерены, сетку не строим). Без regions — одна сплошная масса,
// как в ленте. В режиме regions холст рисуется с dpr не выше 2 и ~24 кадра/с (мелкие облачка, движение неразличимо).
const REGION_DPR_MAX = 2          // облачка по словам: площадь холста при dpr 3 была бы ×2.25 зря
const REGION_FRAME_MS = 1000 / 24 // облачка по словам рисуем ~24 кадра/с (лента — 30, см. frame ниже)

// Картинка покоя с текущих позиций шариков (счётчик для DBG — spoilerStats.js)
function stillUrl(bubbles, w, h, dpr) {
  countStill()
  return renderStillImage(bubbles, w, h, dpr)
}

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
  // Пересборка — не чаще раза за кадр: ресайз блока и смена regions (масштаб фразы → замер слов → …) приходят пачкой,
  // а сетка (тысячи шариков) нужна по последнему состоянию
  const frameRef = useRef(0)
  const layoutRef = useRef(null)
  function scheduleLayout() {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => { frameRef.current = 0; layoutRef.current?.() })
  }
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || unlocked) return
    function layout() {
      const regs = regionsRef.current
      if (Array.isArray(regs) && regs.length === 0) return // слова ещё не измерены (CatchStripPhrase) — строить нечего
      const rect = wrap.getBoundingClientRect()
      // Пересборка — при другом наборе регионов (даже если размер блока тот же: сетка без регионов — сплошная масса)
      // или заметной смене размера (ResizeObserver иногда шлёт субпиксельный шум — его needsRebuild не считает)
      const next = { w: rect.width, h: rect.height, sig: regionsKey(regs), regions: regs }
      if (!needsRebuild(lastBuiltRef.current, next)) return
      lastBuiltRef.current = next
      const w = rect.width + MARGIN_X * 2
      const h = rect.height + MARGIN_Y * 2
      // Полный DPR (до 3): на Retina шарики радиусом 1-2px иначе смазаны; облачка по словам — не выше 2
      const dpr = Math.min(window.devicePixelRatio || 1, Array.isArray(regs) ? REGION_DPR_MAX : 3)
      sizeRef.current = { w, h, dpr }
      countRebuild()
      bubblesRef.current = buildGrid(rect.width, rect.height, regs)
      // Живой холст уже на экране — картинка покоя не нужна (её снимет засыпание), подгоняем размер холста,
      // следующий кадр цикла дорисует. Во время взрыва сюда не попасть: unlocked снимает наблюдатель
      const canvas = canvasRef.current
      setStill({ url: canvas ? null : stillUrl(bubblesRef.current, w, h, dpr), w, h })
      if (canvas) fitCanvas(canvas)
    }
    layoutRef.current = layout
    layout()
    const ro = new ResizeObserver(scheduleLayout)
    ro.observe(wrap)
    return () => { ro.disconnect(); cancelAnimationFrame(frameRef.current); frameRef.current = 0; layoutRef.current = null }
  }, [unlocked])
  const firstRegionsRef = useRef(true)
  useLayoutEffect(() => {
    if (firstRegionsRef.current) { firstRegionsRef.current = false; return } // первая сборка — синхронно, выше
    scheduleLayout()
  }, [regionsSig])

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

    // Лента — через кадр (30/с при 60Гц); облачка по словам — по таймеру ~24/с (на 60Гц кадры через 2-3 тика)
    const paced = Array.isArray(regionsRef.current)
    let last = performance.now()
    let due = last
    let skip = 0
    function frame(now) {
      rafRef.current = requestAnimationFrame(frame)
      if (paced) {
        if (now < due - 2) return
        due = Math.max(due + REGION_FRAME_MS, now)
      } else {
        skip ^= 1
        if (skip) return
      }
      const dt = Math.max(0, Math.min(paced ? 64 : 48, now - last))
      last = now
      draw(dt)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (!mountedRef.current) return
      // Холст не уснул, а перешёл во взрыв (тот же элемент, класс уже новый): картинка покоя не понадобится
      if (canvas.classList.contains('phraseBubbleCanvasExploding')) return
      // Слайд ушёл с экрана: картинка покоя — с тех позиций, где шарики
      // остановились, чтобы возврат canvas продолжил движение без скачка
      setStill(s => s ? { ...s, url: stillUrl(bubblesRef.current, s.w, s.h, sizeRef.current.dpr) } : s)
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
      {!showCanvas && !unlocked && still?.url && (
        <img
          className="phraseBubbleStill" src={still.url} alt="" draggable={false} aria-hidden="true"
          style={{ left: -MARGIN_X, top: -MARGIN_Y, width: still.w, height: still.h }}
        />
      )}
    </div>
  )
}
