import { useEffect, useRef, useState } from 'react'
import { nextSpoilerId, setSpoilerStat, clearSpoilerStat } from './spoilerStats.js'
import {
  MARGIN_X, MARGIN_Y, EXPLODE_MARGIN, EXPLODE_POWER_MIN, EXPLODE_POWER_MAX,
  buildGrid, drawFloat, drawExplode,
} from './phraseBubbleDraw.js'

// Шарики-спойлер поверх фразы модуля (замена blur+зерна) для способных
// устройств — на слабых и при prefers-reduced-motion вместо этого компонента
// монтируется PhraseBubbleStatic (см. PhraseBubbleSpoiler.jsx-переключатель).
// Плотная сетка мелких мягких шариков без чёткой границы почти полностью
// перекрывает текст и колышется волнообразно (wiggle: дрейф + лёгкая
// пульсация радиуса) — живее, чем ровное покачивание. Тап — шарики
// разлетаются короткой вспышкой за пределы своей области. Текст открывается
// сразу по тапу (unlocked), не дожидаясь конца вспышки; канвас взрыва
// пропадает из DOM чуть позже, когда шарики догорят (revealed). onUnlock
// зовётся в момент тапа — родитель может синхронно с этим показать что-то
// ещё (см. FeedSlide: подпись выкатывается из-под фразы).
// Все шарики рисуются ОДНИМ Path2D + один fill() за кадр (при взрыве —
// несколько fill(), по бакетам альфы) вместо drawImage на каждый шарик —
// на порядок дешевле при большой плотности. Мягкого края (ctx.filter blur)
// сознательно нет — на слабых Android software-блюр всего канваса стоил
// дороже всего остального вместе взятого (см. фикс лагов ленты).
// Анимация идёт не только на активном слайде, но и на соседе в сторону
// скролла (near проп уже отфильтрован по направлению в FeedTab — см.
// scrollDirRef в useFeedVirtualizer), а не на обоих сразу, как раньше:
// тёплых холстов одновременно максимум 2, а не 3. Дальние слайды не
// анимируются вовсе, а тёплый, но не активный сосед перерисовывается раз в
// три кадра (а не каждый) — иначе быстрый скролл ленты не укладывался в кадр.
// Сетка шариков строится только по размеру текста (contentW/H), а холст шире
// на MARGIN_X/MARGIN_Y с каждой стороны (по высоте запас меньше — полоса
// шариков тоньше, ближе к высоте самого текста) — в этом запасе шарики у
// края успевают погаснуть (альфа уходит в 0), граница канваса не видна.
// Сама геометрия и отрисовка — phraseBubbleDraw.js.
export default function PhraseBubbleAnimated({ active, near, tabVisible = true, onUnlock, children }) {
  // near (сосед по свайпу, как в SlideVideo) — плаваем чуть раньше, чем
  // слайд станет активным, иначе при перелистывании шарики на новом слайде
  // видно с задержкой (холст пустой, пока не отрисован первый кадр).
  // tabVisible — лента вообще на экране? Без него активный слайд рисовал все
  // частицы каждый кадр под уроком, на «Моих уроках», в профиле: датчик на
  // iPhone показывал 5 rAF-циклов по 60 кадров/с весь урок, а Chrome —
  // 35% Scripting в покое. Это и делало дёрганой системную анимацию
  // сворачивания приложения
  const warm = (active || near) && tabVisible
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const bubblesRef = useRef([])
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const lastBuiltRef = useRef({ w: -1, h: -1 })
  const rafRef = useRef(0)
  const explodingRef = useRef(false)
  // active в ref — читается кадром rAF, который не пересоздаётся при каждой
  // смене active (эффект анимации зависит только от warm, см. ниже), иначе
  // значение внутри замыкания кадра было бы устаревшим
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])
  const [revealed, setRevealed] = useState(false)
  // Текст открывается в момент тапа (сразу вместе со стартом взрыва), а не
  // после того, как шарики долетят и погаснут — иначе раскрытие ощущается
  // как задержка. revealed (позже) только убирает канвас взрыва из DOM
  const [unlocked, setUnlocked] = useState(false)
  const idRef = useRef(null)
  if (idRef.current === null) idRef.current = nextSpoilerId()

  // Отчёт в реестр DBG-панели: сколько шариков рисует ЭТОТ холст и тёплый ли
  // он (реально анимируется каждый кадр, а не просто смонтирован) — см.
  // spoilerStats.js. Снимается при закрытии/размонтировании
  useEffect(() => {
    if (revealed) { clearSpoilerStat(idRef.current); return }
    setSpoilerStat(idRef.current, bubblesRef.current.length, warm)
    return () => clearSpoilerStat(idRef.current)
  }, [warm, revealed])
  useEffect(() => () => clearSpoilerStat(idRef.current), [])

  // Раскладка сетки шариков по размеру блока — пересчитывается при ресайзе
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas || revealed) return

    function layout() {
      // Во время взрыва канвас уже переразмечен под разлёт (см. explode) и
      // частицы летят — пересчёт здесь стёр бы холст и пересобрал сетку
      // заново, оборвав вспышку. Ресайз в этот момент реален: по тапу слова
      // фразы становятся кликабельными и текст чуть меняет ширину
      if (explodingRef.current) return
      const rect = wrap.getBoundingClientRect()
      const w = rect.width + MARGIN_X * 2
      const h = rect.height + MARGIN_Y * 2
      // Канвас маленький (только сам блок фразы), поэтому полный DPR экрана
      // не бьёт по производительности — а вот занижать его нельзя: на
      // Retina-экранах (DPR 3) шарики радиусом в 1-2px иначе получаются
      // смазанными (апскейл малого канваса до реального размера на экране)
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      canvas.style.left = -MARGIN_X + 'px'
      canvas.style.top = -MARGIN_Y + 'px'
      sizeRef.current = { w, h, dpr }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      // Ресайз-обсёрвер иногда шлёт субпиксельный шум (доли пикселя) — не
      // пересобираем всю сетку заново, если размер по сути не изменился
      // (это заметная синхронная работа при частой пересборке во время
      // быстрого скролла ленты, когда много слайдов переиспользуются подряд)
      const last = lastBuiltRef.current
      if (Math.abs(last.w - rect.width) < 2 && Math.abs(last.h - rect.height) < 2) return
      lastBuiltRef.current = { w: rect.width, h: rect.height }
      bubblesRef.current = buildGrid(rect.width, rect.height)
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [revealed])

  // Анимация: плавает пока слайд активен или в соседях (warm) — на холодных
  // слайдах цикл не крутится вовсе (ни одного rAF), а не «крутится и выходит
  // в начале кадра»: пять холостых циклов по 60/с — тоже нагрузка и повод для
  // браузера не засыпать. Взрыв всегда доигрывается до конца, даже если
  // слайд остыл посреди него
  useEffect(() => {
    if (revealed) return
    const canvas = canvasRef.current
    if (!canvas) return
    if (!warm && !explodingRef.current) return
    const ctx = canvas.getContext('2d')

    let last = performance.now()
    let bgFrameSkip = 0
    let floatSkip = 0
    function frame(now) {
      if (!warm && !explodingRef.current) { rafRef.current = 0; return }
      rafRef.current = requestAnimationFrame(frame)
      // Тёплый, но не активный (сосед) — перерисовываем раз в три кадра, а
      // не каждый: при быстром скролле одновременно тёплыми могут быть
      // активный + сосед, и полная перерисовка обоих на каждом кадре — то,
      // что не успевает уложиться в бюджет кадра
      if (!activeRef.current && !explodingRef.current) {
        bgFrameSkip = (bgFrameSkip + 1) % 3
        if (bgFrameSkip !== 0) return
      } else if (!explodingRef.current) {
        // Плавание на фокусе — 30 кадров/с: ~1000-1800 кружков на холст при
        // dpr=3 каждый кадр держали GPU занятым всё время, пока открыта лента
        // (Chrome: 35% Scripting в покое; iPhone: дёрганое сворачивание).
        // Медленный дрейф на 30 к/с неотличим от 60, взрыв — по-прежнему на 60
        floatSkip ^= 1
        if (floatSkip) return
      }
      const dt = Math.min(32, now - last)
      last = now
      const { w, h, dpr } = sizeRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const bubbles = bubblesRef.current
      const allDone = explodingRef.current
        ? drawExplode(ctx, bubbles, dt, w, h)
        : (drawFloat(ctx, bubbles, dt), false)
      if (explodingRef.current && allDone) {
        cancelAnimationFrame(rafRef.current)
        setRevealed(true)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [warm, revealed])

  function explode() {
    if (unlocked || explodingRef.current) return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    setUnlocked(true)
    onUnlock?.()
    explodingRef.current = true

    // Даём холсту запас пошире (EXPLODE_MARGIN вместо обычного MARGIN_X/Y),
    // иначе шарикам буквально некуда лететь и они срезаются краем маленького канваса
    const rect = wrap.getBoundingClientRect()
    const dpr = sizeRef.current.dpr || 1
    const w = rect.width + EXPLODE_MARGIN * 2
    const h = rect.height + EXPLODE_MARGIN * 2
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.style.left = -EXPLODE_MARGIN + 'px'
    canvas.style.top = -EXPLODE_MARGIN + 'px'
    sizeRef.current = { w, h, dpr }

    const shiftX = EXPLODE_MARGIN - MARGIN_X
    const shiftY = EXPLODE_MARGIN - MARGIN_Y
    const cx = w / 2, cy = h / 2
    for (const b of bubblesRef.current) {
      // Мутируем частицы в ref намеренно — они же читаются кадром rAF в
      // соседнем эффекте; это общее mutable-состояние canvas-анимации, не React state
      // eslint-disable-next-line react-hooks/immutability
      b.ax += shiftX
      b.ay += shiftY
      const angle = Math.atan2(b.ay - cy, b.ax - cx) + (Math.random() - 0.5) * 0.7
      const power = EXPLODE_POWER_MIN + Math.random() * (EXPLODE_POWER_MAX - EXPLODE_POWER_MIN)
      b.vx = Math.cos(angle) * power
      b.vy = Math.sin(angle) * power - 2
      b.t = 0
    }
  }

  return (
    <div className="phraseBubbleWrap" ref={wrapRef} onClick={explode}>
      {/* Текст спрятан (visibility, не display) до тапа — сам текст
          блокирован, а не просто прикрыт сверху канвасом. Открывается
          сразу по тапу, параллельно со взрывом (не ждёт его конца) */}
      <div className={unlocked ? 'phraseBubbleText' : 'phraseBubbleText phraseBubbleTextHidden'}>
        {children}
      </div>
      {!revealed && (
        <canvas className="phraseBubbleCanvas" ref={canvasRef} aria-hidden="true" />
      )}
    </div>
  )
}
