import { useEffect, useRef, useState } from 'react'

// Шарики-спойлер поверх фразы модуля (замена blur+зерна): плотная сетка
// мелких мягких шариков без чёткой границы почти полностью перекрывает текст
// (сами шарики почти непрозрачны в центре — так их оттенок не смешивается с
// тёмным фоном видео и не выглядит «грязным») и плавно колышется. Тап —
// шарики разлетаются короткой вспышкой за пределы своей области. Текст
// открывается сразу по тапу (unlocked), не дожидаясь конца вспышки; сам
// канвас взрыва пропадает из DOM чуть позже, когда шарики догорят (revealed).
// Один спрайт-шарик рисуется один раз в оффскрин-канвас и дальше только
// копируется (drawImage) — на слабых устройствах это на порядок дешевле
// gradient+arc на каждый шарик каждый кадр. Анимация идёт не только на
// активном слайде, но и на ближайшем соседе (near, как в SlideVideo) — иначе
// при перелистывании шарики на новом слайде видно с задержкой (первый кадр
// на пустом холсте). Дальние слайды не анимируются вовсе, а «тёплый», но не
// активный сосед перерисовывается через кадр (вполовину реже) — иначе при
// быстром скролле ленты (до 3 тёплых слайдов разом) не укладывались в кадр.
// Сетка шариков строится только по размеру текста (contentW/H), а холст
// шире на MARGIN с каждой стороны — в этом запасе шарики у края успевают
// полностью погаснуть (альфа спрайта уходит в 0 внутри радиуса), поэтому
// прямоугольная граница канваса не видна как «обрезанный контейнер».
const SPACING = 3
const RADIUS = 1.75
// Путь колебания (не скорость — она отдельно в speed у каждого шарика)
const AMP_MAX = 4.5
// Максимальная глубина «бахромы» шариков за прямоугольником сетки (см. buildGrid)
const FRINGE_DEPTH_MAX = SPACING * 3.2
const MARGIN = Math.ceil(RADIUS * 1.15 + AMP_MAX + FRINGE_DEPTH_MAX + 4)
const SPRITE_SIZE = 32
const EXPLODE_MS = 750
// Взрыв: холст на время вспышки увеличивается до этого запаса (см. explode()) —
// шарики летят с трением (замедляются) и гаснут по мере приближения к новой,
// уже далёкой границе, поэтому растворяются плавно, а не упираются в край
const EXPLODE_MARGIN = 120
const EXPLODE_FADE_ZONE = 46
const EXPLODE_POWER_MIN = 6
const EXPLODE_POWER_MAX = 14
const EXPLODE_FRICTION_PER_MS = 0.992

function makeSprite() {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE_SIZE
  const g = c.getContext('2d')
  const cx = SPRITE_SIZE / 2
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx)
  grad.addColorStop(0, 'rgba(248,250,252,0.97)')
  grad.addColorStop(0.65, 'rgba(248,250,252,0.92)')
  grad.addColorStop(1, 'rgba(248,250,252,0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(cx, cx, cx, 0, Math.PI * 2)
  g.fill()
  return c
}
let sharedSprite = null

// contentW/H — размер самого текста (без MARGIN); координаты шариков сразу
// смещены на MARGIN, чтобы попасть в систему координат холста. Джиттер узла
// сетки + разброс радиуса уводят рисунок от ровного прямоугольного растра —
// читается как абстрактное скопление, а не сетка/решётка. Дополнительно по
// периметру рассеяна «бахрома» шариков за пределами прямоугольника — без неё
// общий силуэт всё равно читался бы как прямоугольник с явными углами
function buildGrid(contentW, contentH) {
  const cols = Math.ceil(contentW / SPACING) + 1
  const rows = Math.ceil(contentH / SPACING) + 1
  const jitter = SPACING * 0.55
  const bubbles = []
  const push = (ax, ay, sizeScale) => {
    bubbles.push({
      ax,
      ay,
      r: RADIUS * sizeScale * (0.6 + Math.random() * 0.8),
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.25,
      amp: 1.3 + Math.random() * (AMP_MAX - 1.3),
      vx: 0,
      vy: 0,
      t: 0,
    })
  }

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const offsetX = (ry % 2) * (SPACING / 2)
      push(
        MARGIN + rx * SPACING + offsetX - SPACING / 2 + (Math.random() - 0.5) * jitter,
        MARGIN + ry * SPACING - SPACING / 2 + (Math.random() - 0.5) * jitter,
        1,
      )
    }
  }

  // Бахрома: точки вдоль периметра прямоугольника, каждая сдвинута наружу
  // по нормали к краю на случайную глубину (чаще у самого края, реже
  // подальше — произведение двух random() даёт спад плотности) плюс
  // случайный сдвиг вдоль края. Шарики бахромы чуть мельче — истончаются к краю
  const perimeter = 2 * (contentW + contentH)
  const fringeCount = Math.round((perimeter / SPACING) * 1.4)
  for (let i = 0; i < fringeCount; i++) {
    const t = Math.random() * perimeter
    let x, y, nx, ny
    if (t < contentW) { x = t; y = 0; nx = 0; ny = -1 }
    else if (t < contentW + contentH) { x = contentW; y = t - contentW; nx = 1; ny = 0 }
    else if (t < 2 * contentW + contentH) { x = contentW - (t - contentW - contentH); y = contentH; nx = 0; ny = 1 }
    else { x = 0; y = contentH - (t - 2 * contentW - contentH); nx = -1; ny = 0 }
    const depth = Math.random() * Math.random() * FRINGE_DEPTH_MAX
    const tangentJitter = (Math.random() - 0.5) * SPACING * 1.5
    const tx = -ny, ty = nx
    push(
      MARGIN + x + nx * depth + tx * tangentJitter,
      MARGIN + y + ny * depth + ty * tangentJitter,
      0.55 + Math.random() * 0.5,
    )
  }

  return bubbles
}

export default function PhraseBubbleSpoiler({ active, near, children }) {
  // near (сосед по свайпу, как в SlideVideo) — плаваем чуть раньше, чем
  // слайд станет активным, иначе при перелистывании шарики на новом слайде
  // видно с задержкой (холст пустой, пока не отрисован первый кадр)
  const warm = active || near
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

  // Раскладка сетки шариков по размеру блока — пересчитывается при ресайзе
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas || revealed) return
    if (!sharedSprite) sharedSprite = makeSprite()

    function layout() {
      const rect = wrap.getBoundingClientRect()
      const w = rect.width + MARGIN * 2
      const h = rect.height + MARGIN * 2
      // Канвас маленький (только сам блок фразы), поэтому полный DPR экрана
      // не бьёт по производительности — а вот занижать его нельзя: на
      // Retina-экранах (DPR 3) шарики радиусом в 1-2px иначе получаются
      // смазанными (апскейл малого канваса до реального размера на экране)
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      canvas.style.left = -MARGIN + 'px'
      canvas.style.top = -MARGIN + 'px'
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

  // Анимация: плавает пока слайд активен или в соседях (warm) — не тратим
  // кадры только на дальних, скрытых слайдах; взрыв всегда доигрывается до конца
  useEffect(() => {
    if (revealed) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let last = performance.now()
    let bgFrameSkip = 0
    function frame(now) {
      rafRef.current = requestAnimationFrame(frame)
      if (!warm && !explodingRef.current) return
      // Тёплый, но не активный (сосед) — перерисовываем через кадр, а не
      // каждый: при быстром скролле одновременно тёплыми могут быть до 3
      // слайдов, и полная перерисовка каждого на каждом кадре — то, что не
      // успевает уложиться в бюджет кадра. На фокусе (активный/взрыв) — без пропусков
      if (!activeRef.current && !explodingRef.current) {
        bgFrameSkip = (bgFrameSkip + 1) % 2
        if (bgFrameSkip !== 0) return
      }
      const dt = Math.min(32, now - last)
      last = now
      const { w, h, dpr } = sizeRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const bubbles = bubblesRef.current
      let allDone = true
      for (const b of bubbles) {
        if (explodingRef.current) {
          b.t += dt
          if (b.t >= EXPLODE_MS) continue
          allDone = false
          // Трение гасит скорость — шарик тормозит и почти останавливается,
          // а не летит по прямой бесконечно (что и упиралось бы в границу)
          const decay = EXPLODE_FRICTION_PER_MS ** dt
          b.vx *= decay
          b.vy = b.vy * decay + 0.01 * dt
          b.ax += b.vx * dt * 0.06
          b.ay += b.vy * dt * 0.06
          const timeAlpha = Math.max(0, 1 - (b.t / EXPLODE_MS) ** 1.5)
          // Доп. затухание по расстоянию до новой (увеличенной) границы холста —
          // гарантирует, что альфа уйдёт в 0 раньше, чем шарик долетит до края
          const distToEdge = Math.min(b.ax, w - b.ax, b.ay, h - b.ay)
          const edgeAlpha = Math.max(0, Math.min(1, distToEdge / EXPLODE_FADE_ZONE))
          ctx.globalAlpha = timeAlpha * edgeAlpha
          ctx.drawImage(sharedSprite, b.ax - b.r, b.ay - b.r, b.r * 2, b.r * 2)
        } else {
          allDone = false
          if (!reduceMotion) b.phase += b.speed * dt * 0.001
          const dx = Math.cos(b.phase) * b.amp
          const dy = Math.sin(b.phase * 1.3) * b.amp
          ctx.globalAlpha = 1
          ctx.drawImage(sharedSprite, b.ax + dx - b.r, b.ay + dy - b.r, b.r * 2, b.r * 2)
        }
      }
      ctx.globalAlpha = 1
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
    explodingRef.current = true
    setUnlocked(true)

    // Даём холсту запас пошире (EXPLODE_MARGIN вместо обычного MARGIN), иначе
    // шарикам буквально некуда лететь и они срезаются краем маленького канваса
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

    const shift = EXPLODE_MARGIN - MARGIN
    const cx = w / 2, cy = h / 2
    for (const b of bubblesRef.current) {
      // Мутируем частицы в ref намеренно — они же читаются кадром rAF в
      // соседнем эффекте; это общее mutable-состояние canvas-анимации, не React state
      // eslint-disable-next-line react-hooks/immutability
      b.ax += shift
      b.ay += shift
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
