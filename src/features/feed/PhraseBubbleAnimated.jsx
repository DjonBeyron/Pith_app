import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextSpoilerId, setSpoilerStat, clearSpoilerStat, countRebuild, countStill, noteGpu, canvasBytes } from './spoilerStats.js'
import { renderStillImage } from './phraseBubbleDraw.js'
import { buildGrid } from './phraseBubbleGrid.js'
import { warmUp } from './phraseBubbleWarm.js'
import { MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'
import { hasExplode, regionsKey, needsRebuild } from './phraseBubbleRegions.js'
import { usePhraseBubbleExplode } from './usePhraseBubbleExplode.js'
import { usePhraseBubbleFloat } from './usePhraseBubbleFloat.js'

// Шарики-спойлер поверх фразы модуля (замена blur+зерна) для способных устройств — на слабых и при
// prefers-reduced-motion вместо него монтируется PhraseBubbleStatic (см. PhraseBubbleSpoiler.jsx). Плотная сетка мелких
// шариков почти полностью перекрывает текст и колышется поштучно (wiggle: две синусоиды + дыхание радиуса); тап — шарики
// разлетаются короткой вспышкой, текст открывается сразу по тапу (unlocked), холсты пропадают, когда шарики догорят
// (revealed). onUnlock зовётся в момент тапа — родитель может синхронно показать что-то ещё (FeedSlide: подпись).
//
// ДВА СЛОЯ ХОЛСТОВ. Постоянный лёгкий холст плавания (запас MARGIN_X/Y ≈ 14/9px вокруг фразы; облачка по словам — dpr ≤ 1.5,
// лента — ≤ 3) живёт ТОЛЬКО у активного слайда видимой ленты (live). Холст взрыва (запас EXPLODE_MARGIN = 120px, dpr 1)
// монтируется только на время взрыва, после него уничтожается (usePhraseBubbleExplode.js); холст плавания на старте
// взрыва освобождается. Соседи в виртуальном окне, лента под уроком, «Мои уроки», профиль — вместо canvas одна статичная <img>
// (renderStillImage, dpr ≤ STILL_DPR_MAX; при размонтировании слайда src сбрасывается). Бисекция на iPhone показала, что даже
// спящие canvas (по одному на 5 слайдов, dpr=3) делали дёрганой системную анимацию сворачивания приложения. Подмена картинка ↔
// canvas без скачка: картинка рисуется с ТЕКУЩИХ позиций шариков (drawFloat с dt=0), canvas стартует с тех же фаз; первый
// кадр — в useLayoutEffect, до показа. Плавание — 30 кадров/с (лента) или ~20 (облачка), взрыв — 60; уход приложения в фон /
// под шторку iOS останавливает все циклы (bubbleLifecycle.js). Геометрия и отрисовка — phraseBubbleDraw.js. Цикл плавания —
// usePhraseBubbleFloat.js. Картинка покоя (toDataURL, миллисекунды главного потока) снимается ТОЛЬКО когда холста нет: при
// засыпании живого холста и при сборке сетки, пока на экране картинка. Пока холст живой, пересборка сетки картинку не снимает.
//
// Режим «Ловли слов» (catch/CatchStripPhrase): onTap(e) — задан → тап НЕ взрывает, а отдаётся родителю (он ищет слово по
// координате); explode — команда на взрыв: true — всё сразу, число n — взорваны первые n облачков, массив — индексы
// (usePhraseBubbleExplode.js); текст открывается с первого взрыва. regions — прямоугольники слов { x, y, w, h } относительно
// текстового блока: шарики лежат отдельными облачками над словами (buildGrid), между словами промежуток чистый; пересборка
// сетки при смене regions — не сразу, а раз за кадр; пока regions — пустой массив, слова ещё не измерены, сетку не строим.
// Без regions — одна сплошная масса, как в ленте. Холст плавания облачек касаний не ловит (иначе накрыл бы клавиатуру
// ниже) — тап ловит прозрачная зона вокруг обёртки (.phraseBubbleWrapHit). Скорости частиц готовятся заранее, в простое
// (warmUp, phraseBubbleWarm.js).
const REGION_DPR_MAX = 1.5 // облачка по словам: площадь холста плавания растёт ×dpr²; 2 → 1.5 это −44% при почти той же чёткости
const FEED_DPR_MAX = 3     // сплошная масса ленты: шарики радиусом 1-2px на Retina иначе смазаны
const STILL_DPR_MAX = 2    // картинка покоя: декодированная = w·h·dpr²·4 байт у каждого соседнего слайда

// Картинка покоя с текущих позиций шариков (счётчик для DBG — spoilerStats.js)
function stillUrl(bubbles, size) {
  countStill()
  return renderStillImage(bubbles, size.w, size.h, Math.min(size.dpr, STILL_DPR_MAX))
}

export default function PhraseBubbleAnimated({ active, tabVisible = true, onUnlock, onTap, explode = false, regions = null, children }) {
  const live = active && tabVisible
  const wrapRef = useRef(null)
  const canvasRef = useRef(null) // холст плавания
  const blastRef = useRef(null)  // холст взрыва (монтируется только на время взрыва)
  const stillImgRef = useRef(null)
  const bubblesRef = useRef([])
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 }) // размер холста плавания и картинки покоя: фраза + MARGIN_X/Y с каждой стороны
  const warmRef = useRef(null) // отмена подготовки скоростей взрыва (warmUp) для текущей сетки
  const lastBuiltRef = useRef(null) // { w, h, sig } последней сборки сетки (needsRebuild)
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

  const wide = Array.isArray(regions) // облачка по словам: холст касаний не ловит
  const canvasCls = ['phraseBubbleCanvas', exploding && 'phraseBubbleCanvasExploding', wide && 'phraseBubbleCanvasWide']
    .filter(Boolean).join(' ')
  // На взрыве холст плавания остаётся в DOM скрытым (класс Exploding) — по нему цикл плавания понимает, что холст не уснул, а
  // перешёл во взрыв; освобождает его usePhraseBubbleExplode. Сам взрыв рисуется на отдельном холсте blastRef
  const showCanvas = !revealed && (exploding || (live && !unlocked))
  const ready = !!still

  // Размонтирование: cleanup плавания не должен переснимать картинку покоя (toDataURL — миллисекунды главного потока, при
  // быстром скролле слайды размонтируются пачками); картинку покоя освобождаем (src = '') — слайд ушёл из окна. Объявлен ДО
  // эффекта плавания — cleanup'ы идут в порядке объявления, флаг успевает упасть
  const mountedRef = useRef(true)
  useLayoutEffect(() => () => {
    mountedRef.current = false
    if (stillImgRef.current) stillImgRef.current.src = ''
  }, [])

  // Холст плавания под размер из sizeRef (сброс width/height очищает контекст)
  function fitCanvas(canvas) {
    const { w, h, dpr } = sizeRef.current
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.style.left = -MARGIN_X + 'px'
    canvas.style.top = -MARGIN_Y + 'px'
    noteGpu(`${idRef.current}:f`, canvasBytes(w, h, dpr))
  }

  // Отчёт в реестр DBG-панели (spoilerStats.js): шарики, живой ли холст и память картинки покоя
  useEffect(() => {
    const id = idRef.current
    if (revealed) { clearSpoilerStat(id); noteGpu(`${id}:i`, 0); return }
    setSpoilerStat(id, bubblesRef.current.length, showCanvas)
    const img = !showCanvas && !unlocked && still?.url
    noteGpu(`${id}:i`, img ? canvasBytes(still.w, still.h, Math.min(sizeRef.current.dpr, STILL_DPR_MAX)) : 0)
    return () => { clearSpoilerStat(id); noteGpu(`${id}:i`, 0) }
  }, [showCanvas, revealed, unlocked, still])

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
      const byRegions = Array.isArray(regs)
      const w = rect.width + MARGIN_X * 2
      const h = rect.height + MARGIN_Y * 2
      const dpr = Math.min(window.devicePixelRatio || 1, byRegions ? REGION_DPR_MAX : FEED_DPR_MAX)
      sizeRef.current = { w, h, dpr }
      countRebuild()
      const grid = buildGrid(rect.width, rect.height, regs)
      bubblesRef.current = grid
      warmRef.current?.()
      warmRef.current = byRegions ? warmUp(grid) : null
      // Живой холст уже на экране — картинка покоя не нужна (её снимет засыпание), подгоняем размер холста,
      // следующий кадр цикла дорисует. Во время взрыва сюда не попасть: unlocked снимает наблюдатель
      const canvas = canvasRef.current
      setStill({ url: canvas ? null : stillUrl(grid, sizeRef.current), w, h })
      if (canvas) fitCanvas(canvas)
    }
    layoutRef.current = layout
    layout()
    const ro = new ResizeObserver(scheduleLayout)
    ro.observe(wrap)
    return () => {
      ro.disconnect(); cancelAnimationFrame(frameRef.current); frameRef.current = 0; layoutRef.current = null
      warmRef.current?.(); warmRef.current = null
    }
  }, [unlocked])
  const firstRegionsRef = useRef(true)
  useLayoutEffect(() => {
    if (firstRegionsRef.current) { firstRegionsRef.current = false; return } // первая сборка — синхронно, выше
    scheduleLayout()
  }, [regionsSig])

  // Плавание на живом холсте (usePhraseBubbleFloat.js); уход холста — картинка покоя с текущих позиций
  usePhraseBubbleFloat({
    live, unlocked, exploding, ready, canvasRef, bubblesRef, sizeRef, regionsRef, isMounted: () => mountedRef.current, idRef, fit: fitCanvas,
    onSleep: () => setStill(st => st ? { ...st, url: stillUrl(bubblesRef.current, sizeRef.current) } : st),
  })

  // Взрыв на отдельном холсте blastRef (команда — проп explode или тап)
  usePhraseBubbleExplode({
    exploding, explode: command, floatRef: canvasRef, blastRef, bubblesRef, sizeRef, idRef, setUnlocked, setRevealed, onUnlock,
  })

  // Тап: с onTap — решает родитель (слово по координате), иначе взрыв
  function tap(e) {
    if (onTap) { onTap(e); return }
    if (exploding || unlocked) return
    setTapped(true)
  }

  return (
    <div className={wide ? 'phraseBubbleWrap phraseBubbleWrapHit' : 'phraseBubbleWrap'} ref={wrapRef} onClick={tap}
      style={wide ? { '--pb-mx': MARGIN_X + 'px', '--pb-my': MARGIN_Y + 'px' } : undefined}>
      {/* Текст спрятан (visibility, не display) до тапа — сам текст
          блокирован, а не просто прикрыт сверху. Открывается сразу по тапу */}
      <div className={unlocked ? 'phraseBubbleText' : 'phraseBubbleText phraseBubbleTextHidden'}>
        {children}
      </div>
      {showCanvas && <canvas className={canvasCls} ref={canvasRef} aria-hidden="true" />}
      {/* Холст взрыва: на 120px шире фразы со всех сторон и лежит поверх строки «перевести» — касаний не ловит (иначе на
          Android тап по переводу уходил в холст, пока шарики разлетаются). Только на время взрыва */}
      {exploding && !revealed && (
        <canvas className="phraseBubbleCanvas phraseBubbleCanvasBlast" ref={blastRef} aria-hidden="true" />
      )}
      {!showCanvas && !unlocked && still?.url && (
        <img
          className="phraseBubbleStill" src={still.url} alt="" draggable={false} aria-hidden="true" ref={stillImgRef}
          style={{ left: -MARGIN_X, top: -MARGIN_Y, width: still.w, height: still.h }}
        />
      )}
    </div>
  )
}
