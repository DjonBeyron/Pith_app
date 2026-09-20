// Геометрия и отрисовка шариков-спойлера фразы (без React) — вынесено из
// PhraseBubbleAnimated.jsx, когда тот упёрся в потолок 400 строк. Здесь:
// константы сетки/полей, LUT для sin/cos, buildGrid (сетка + бахрома),
// drawFloat (плавание: один Path2D + один fill за кадр) и drawExplode
// (взрыв: fill по бакетам альфы). Компонент решает КОГДА рисовать, этот
// модуль — ЧТО и КАК.

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
// Таблица готовых sin/cos вместо живых Math.sin/cos на каждый шарик каждый
// кадр — на слабом Android с ~1800 шариков на холст и до 2 тёплых холстов
// разом это тысячи трансцендентных вызовов в кадр, ощутимая доля времени.
// Точность 2048 делений на 2π более чем достаточна для визуального wiggle
const LUT_SIZE = 2048
const TWO_PI = Math.PI * 2
const SIN_LUT = new Float32Array(LUT_SIZE)
for (let i = 0; i < LUT_SIZE; i++) SIN_LUT[i] = Math.sin((i / LUT_SIZE) * TWO_PI)
function fastSin(x) {
  let idx = x % TWO_PI
  if (idx < 0) idx += TWO_PI
  return SIN_LUT[(idx * (LUT_SIZE / TWO_PI)) | 0]
}
function fastCos(x) {
  return fastSin(x + Math.PI / 2)
}
const BLUR_PX = 0.4
// Максимальная глубина «бахромы» шариков за прямоугольником сетки (см.
// buildGrid). По вертикали (верх/низ) бахрома тоже мельче — та же причина
const FRINGE_DEPTH_MAX = SPACING * 3.2
const FRINGE_DEPTH_MAX_Y = FRINGE_DEPTH_MAX * WANDER_Y_SCALE
// Запас канваса вокруг текста: макс. радиус + макс. размах покачивания +
// глубина бахромы + блюр — раньше считался приблизительно и оказался мал,
// шарики на пике покачивания/пульсации срезались краем канваса. По высоте
// запас меньше (см. WANDER_Y_SCALE) — полоса шариков тоньше
export const MARGIN_X = Math.ceil(MAX_RADIUS + MAX_WANDER + FRINGE_DEPTH_MAX + BLUR_PX * 2 + 2)
export const MARGIN_Y = Math.ceil(MAX_RADIUS + MAX_WANDER_Y + FRINGE_DEPTH_MAX_Y + BLUR_PX * 2 + 2)
const EXPLODE_MS = 750
const ALPHA_BINS = 14
// Взрыв: холст на время вспышки увеличивается до этого запаса (см. explode()) —
// шарики летят с трением (замедляются) и гаснут по мере приближения к новой,
// уже далёкой границе, поэтому растворяются плавно, а не упираются в край
export const EXPLODE_MARGIN = 120
const EXPLODE_FADE_ZONE = 46
export const EXPLODE_POWER_MIN = 6
export const EXPLODE_POWER_MAX = 14
const EXPLODE_FRICTION_PER_MS = 0.992

// contentW/H — размер самого текста (без MARGIN); координаты шариков сразу
// смещены на MARGIN, чтобы попасть в систему координат холста. Джиттер узла
// сетки + разброс радиуса уводят рисунок от ровного прямоугольного растра —
// читается как абстрактное скопление, а не сетка/решётка. Дополнительно по
// периметру рассеяна «бахрома» шариков за пределами прямоугольника — без неё
// общий силуэт всё равно читался бы как прямоугольник с явными углами
export function buildGrid(contentW, contentH) {
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
export function drawFloat(ctx, bubbles, dt) {
  ctx.globalAlpha = 0.94
  ctx.fillStyle = BUBBLE_COLOR
  ctx.beginPath()
  for (const b of bubbles) {
    b.phase += b.speed * dt * 0.001
    const dx = fastCos(b.phase) * b.amp + fastSin(b.phase * 3.1) * b.amp * WIGGLE_SECOND_RATIO
    const dy = (fastSin(b.phase * 1.3) * b.amp + fastCos(b.phase * 2.7) * b.amp * WIGGLE_SECOND_RATIO) * WANDER_Y_SCALE
    const pulse = 1 + PULSE_AMP * fastSin(b.phase * 2.3 + b.pulseOffset)
    const x = b.ax + dx, y = b.ay + dy, r = b.r * pulse
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.globalAlpha = 1
}

// Взрыв: та же идея, но альфа у каждого шарика своя (время + затухание к
// краю), поэтому один fill() не подходит — группируем по «бакетам» альфы
// (ALPHA_BINS штук) и делаем fill() на бакет вместо fill() на шарик
export function drawExplode(ctx, bubbles, dt, w, h) {
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
  ctx.globalAlpha = 1
  return allDone
}
