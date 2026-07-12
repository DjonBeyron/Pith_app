import { useEffect, useRef, useState } from 'react'

// Шарики-спойлер поверх фразы модуля (замена blur+зерна): плотная сетка
// мелких мягких шариков без чёткой границы почти полностью перекрывает текст
// и колышется волнообразно (wiggle: дрейф + лёгкая пульсация радиуса) — живее,
// чем ровное покачивание. Тап — шарики разлетаются короткой вспышкой за
// пределы своей области. Текст открывается сразу по тапу (unlocked), не
// дожидаясь конца вспышки; канвас взрыва пропадает из DOM чуть позже, когда
// шарики догорят (revealed). onUnlock зовётся в момент тапа — родитель может
// синхронно с этим показать что-то ещё (см. FeedSlide: подпись выкатывается
// из-под фразы).
// Все шарики рисуются ОДНИМ Path2D + один fill() за кадр (при взрыве —
// несколько fill(), по бакетам альфы) вместо drawImage на каждый шарик —
// на порядок дешевле при большой плотности. Мягкий край — не градиент на
// каждом шарике, а один общий ctx.filter blur на весь fill().
// Анимация идёт не только на активном слайде, но и на ближайшем соседе (near,
// как в SlideVideo) — иначе при перелистывании шарики видно с задержкой.
// Дальние слайды не анимируются вовсе, а тёплый, но не активный сосед
// перерисовывается через кадр (вполовину реже) — иначе быстрый скролл ленты
// (до 3 тёплых слайдов разом) не укладывался в кадр.
// Сетка шариков строится только по размеру текста (contentW/H), а холст шире
// на MARGIN_X/MARGIN_Y с каждой стороны (по высоте запас меньше — полоса
// шариков тоньше, ближе к высоте самого текста) — в этом запасе шарики у
// края успевают погаснуть (альфа уходит в 0), граница канваса не видна.
const SPACING = 1.27
const RADIUS = 0.55
// Максимальные множители радиуса у основной сетки/бахромы (см. buildGrid:
// push(..., sizeScale) и формулу r внутри) — нужны, чтобы честно посчитать
// MARGIN ниже, а не подбирать его на глаз
const RADIUS_SCALE_MAX = 1.4
const FRINGE_SCALE_MAX = 1.05
// Амплитуда пульсации радиуса — «дыхание» шарика в drawFloat (см. pulse)
const PULSE_AMP = 0.22
const MAX_RADIUS = RADIUS * Math.max(RADIUS_SCALE_MAX, FRINGE_SCALE_MAX) * (1 + PULSE_AMP)
// Путь колебания (не скорость — она отдельно в speed у каждого шарика)
const AMP_MAX = 4.5
// Вертикальный размах меньше горизонтального — полоса шариков тоньше по
// высоте (ближе к высоте самого текста), а не только шире её вбок
const WANDER_Y_SCALE = 0.45
// Вторая (более быстрая) синусоида в wiggle-дрейфе — доля от amp (см. drawFloat)
const WIGGLE_SECOND_RATIO = 0.35
const MAX_WANDER = AMP_MAX * (1 + WIGGLE_SECOND_RATIO)
const MAX_WANDER_Y = MAX_WANDER * WANDER_Y_SCALE
const BUBBLE_COLOR = 'rgb(248,250,252)'
const BLUR_PX = 0.4
// Максимальная глубина «бахромы» шариков за прямоугольником сетки (см.
// buildGrid). По вертикали (верх/низ) бахрома тоже мельче — та же причина
const FRINGE_DEPTH_MAX = SPACING * 3.2
const FRINGE_DEPTH_MAX_Y = FRINGE_DEPTH_MAX * WANDER_Y_SCALE
// Запас канваса вокруг текста: макс. радиус + макс. размах покачивания +
// глубина бахромы + блюр — раньше считался приблизительно и оказался мал,
// шарики на пике покачивания/пульсации срезались краем канваса. По высоте
// запас меньше (см. WANDER_Y_SCALE) — полоса шариков тоньше
const MARGIN_X = Math.ceil(MAX_RADIUS + MAX_WANDER + FRINGE_DEPTH_MAX + BLUR_PX * 2 + 2)
const MARGIN_Y = Math.ceil(MAX_RADIUS + MAX_WANDER_Y + FRINGE_DEPTH_MAX_Y + BLUR_PX * 2 + 2)
const EXPLODE_MS = 750
const ALPHA_BINS = 14
// Взрыв: холст на время вспышки увеличивается до этого запаса (см. explode()) —
// шарики летят с трением (замедляются) и гаснут по мере приближения к новой,
// уже далёкой границе, поэтому растворяются плавно, а не упираются в край
const EXPLODE_MARGIN = 120
const EXPLODE_FADE_ZONE = 46
const EXPLODE_POWER_MIN = 6
const EXPLODE_POWER_MAX = 14
const EXPLODE_FRICTION_PER_MS = 0.992

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
      speed: 0.7 + Math.random() * 0.5,
      amp: 1.3 + Math.random() * (AMP_MAX - 1.3),
      pulseOffset: Math.random() * Math.PI * 2,
      vx: 0,
      vy: 0,
      t: 0,
    })
  }

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const offsetX = (ry % 2) * (SPACING / 2)
      push(
        MARGIN_X + rx * SPACING + offsetX - SPACING / 2 + (Math.random() - 0.5) * jitter,
        MARGIN_Y + ry * SPACING - SPACING / 2 + (Math.random() - 0.5) * jitter,
        1,
      )
    }
  }

  // Бахрома: точки вдоль периметра прямоугольника, каждая сдвинута наружу
  // по нормали к краю на случайную глубину (чаще у самого края, реже
  // подальше — произведение двух random() даёт спад плотности) плюс
  // случайный сдвиг вдоль края. Шарики бахромы чуть мельче — истончаются к краю.
  // На верхнем/нижнем краю (ny !== 0) глубина меньше — та же логика тоньше-по-высоте
  const perimeter = 2 * (contentW + contentH)
  const fringeCount = Math.round((perimeter / SPACING) * 1.4)
  for (let i = 0; i < fringeCount; i++) {
    const t = Math.random() * perimeter
    let x, y, nx, ny
    if (t < contentW) { x = t; y = 0; nx = 0; ny = -1 }
    else if (t < contentW + contentH) { x = contentW; y = t - contentW; nx = 1; ny = 0 }
    else if (t < 2 * contentW + contentH) { x = contentW - (t - contentW - contentH); y = contentH; nx = 0; ny = 1 }
    else { x = 0; y = contentH - (t - 2 * contentW - contentH); nx = -1; ny = 0 }
    const depthMax = ny !== 0 ? FRINGE_DEPTH_MAX_Y : FRINGE_DEPTH_MAX
    const depth = Math.random() * Math.random() * depthMax
    const tangentJitter = (Math.random() - 0.5) * SPACING * 1.5
    const tx = -ny, ty = nx
    push(
      MARGIN_X + x + nx * depth + tx * tangentJitter,
      MARGIN_Y + y + ny * depth + ty * tangentJitter,
      0.55 + Math.random() * 0.5,
    )
  }

  return bubbles
}

// Плавающее состояние: один Path2D на все шарики + один fill(). Wiggle —
// дрейф по двум наложенным синусоидам разной частоты + лёгкая пульсация
// радиуса (дыхание) вместо ровного покачивания по одной синусоиде
function drawFloat(ctx, bubbles, reduceMotion, dt) {
  ctx.filter = `blur(${BLUR_PX}px)`
  ctx.globalAlpha = 0.94
  ctx.fillStyle = BUBBLE_COLOR
  ctx.beginPath()
  for (const b of bubbles) {
    if (!reduceMotion) b.phase += b.speed * dt * 0.001
    const dx = Math.cos(b.phase) * b.amp + Math.sin(b.phase * 3.1) * b.amp * WIGGLE_SECOND_RATIO
    const dy = (Math.sin(b.phase * 1.3) * b.amp + Math.cos(b.phase * 2.7) * b.amp * WIGGLE_SECOND_RATIO) * WANDER_Y_SCALE
    const pulse = 1 + PULSE_AMP * Math.sin(b.phase * 2.3 + b.pulseOffset)
    const x = b.ax + dx, y = b.ay + dy, r = b.r * pulse
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.filter = 'none'
  ctx.globalAlpha = 1
}

// Взрыв: та же идея, но альфа у каждого шарика своя (время + затухание к
// краю), поэтому один fill() не подходит — группируем по «бакетам» альфы
// (ALPHA_BINS штук) и делаем fill() на бакет вместо fill() на шарик
function drawExplode(ctx, bubbles, dt, w, h) {
  const buckets = Array.from({ length: ALPHA_BINS + 1 }, () => [])
  let allDone = true
  for (const b of bubbles) {
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
    const alpha = timeAlpha * edgeAlpha
    if (alpha <= 0.01) continue
    buckets[Math.round(alpha * ALPHA_BINS)].push(b)
  }
  ctx.filter = `blur(${BLUR_PX}px)`
  ctx.fillStyle = BUBBLE_COLOR
  for (let bin = ALPHA_BINS; bin >= 1; bin--) {
    const list = buckets[bin]
    if (!list.length) continue
    ctx.globalAlpha = bin / ALPHA_BINS
    ctx.beginPath()
    for (const b of list) {
      ctx.moveTo(b.ax + b.r, b.ay)
      ctx.arc(b.ax, b.ay, b.r, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  return allDone
}

export default function PhraseBubbleSpoiler({ active, near, onUnlock, children }) {
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

    function layout() {
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
      const allDone = explodingRef.current
        ? drawExplode(ctx, bubbles, dt, w, h)
        : (drawFloat(ctx, bubbles, reduceMotion, dt), false)
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
    onUnlock?.()

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
