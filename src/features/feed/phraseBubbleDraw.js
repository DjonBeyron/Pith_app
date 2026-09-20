// Геометрия и отрисовка шариков-спойлера фразы (без React) — вынесено из
// PhraseBubbleAnimated.jsx, когда тот упёрся в потолок 400 строк. Здесь:
// константы сетки/полей, buildGrid (сетка + бахрома), renderLayerImages
// (покой: группы шариков → картинки, canvas в DOM не живёт) и drawExplode
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

import { LAYER_COUNT } from './phraseBubbleDrift.js'

// Покой без canvas: шарики делятся на LAYER_COUNT групп через одну и каждая
// группа рисуется ОДИН РАЗ в невидимый (не в DOM) canvas → PNG data-URL →
// обычная <img>. Дальше группы дрейфуют CSS-анимацией transform
// (feed-bubble-spoiler.css) — на композиторе, ~0 CPU, и главное: в DOM в
// покое нет ни одного <canvas>. Бисекция на iPhone показала, что именно
// живые canvas-элементы (по одному на слайд, dpr=3) делали дёрганой системную
// анимацию сворачивания приложения — даже когда они ничего не рисовали и
// лента была скрыта под уроком. Canvas остаётся только на 0.75с взрыва.

export function renderLayerImages(bubbles, w, h, dpr) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  const urls = []
  for (let g = 0; g < LAYER_COUNT; g++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 0.94
    ctx.fillStyle = BUBBLE_COLOR
    ctx.beginPath()
    for (let i = g; i < bubbles.length; i += LAYER_COUNT) {
      const b = bubbles[i]
      ctx.moveTo(b.ax + b.r, b.ay)
      ctx.arc(b.ax, b.ay, b.r, 0, Math.PI * 2)
    }
    ctx.fill()
    urls.push(canvas.toDataURL('image/png'))
  }
  return urls
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
