// Отрисовка и взрыв шариков-спойлера фразы (без React) — вынесено из PhraseBubbleAnimated.jsx, когда тот упёрся в
// потолок 400 строк. Здесь: LUT для sin/cos, drawFloat (плавание: один Path2D + один fill за кадр), renderStillImage
// (покой без canvas: картинка с текущих позиций), запуск частиц (prepareBubbles — скорости заранее, startBubbles — старт) и
// drawExplode (взрыв: частицы каждого облачка отдельной группой справа налево, внутри группы — fill по бакетам альфы,
// мелкие частицы квадратиком). Сетка (buildGrid) —
// phraseBubbleGrid.js, константы — phraseBubbleConsts.js. Компонент решает КОГДА рисовать, этот модуль — ЧТО и КАК.

import { PULSE_AMP, WANDER_Y_SCALE, WIGGLE_SECOND_RATIO, EXPLODE_MS } from './phraseBubbleConsts.js'
import {
  EXPLODE_POWER_MIN, EXPLODE_POWER_MAX, EXPLODE_FRICTION_PER_MS, EXPLODE_GRAVITY, EXPLODE_LIFT, EXPLODE_POS_K,
  limitFlight, clampToLim,
} from './phraseBubbleFlight.js'

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
// Бакетов альфы на ОБЛАЧКО (= максимум fill() за кадр взрыва на облачко): было 14, потом 10, теперь 6 — различимо так же,
// а заливок меньше (облачек в воздухе одновременно ~2-3, итого ≤ ~18 мелких заливок вместо 10 больших, зато частиц ≤ 320)
const ALPHA_BINS = 6
// Взрыв: ОТДЕЛЬНЫЙ холст с этим запасом вокруг фразы (dpr 1, создаётся только на время взрыва и сразу уничтожается —
// usePhraseBubbleExplode.js) — шарики летят с трением (замедляются) и гаснут по мере приближения к далёкой границе,
// поэтому растворяются плавно, а не упираются в край. Постоянный холст покоя/плавания маленький (запас MARGIN_X/Y)
export const EXPLODE_MARGIN = 120
const EXPLODE_FADE_ZONE = 46
// Частицы мельче этого радиуса рисуем квадратиком равной площади (rect дешевле arc: нет тесселяции окружности), крупнее — кругом
const RECT_MAX_R = 1.2
const RECT_HALF = Math.sqrt(Math.PI) / 2 // полусторона квадрата той же площади, что круг радиуса 1
// Начальный горизонтальный импульс сильнее вертикального на 25% — «выстрел» в бока
const EXPLODE_VX_BOOST = 1.25
// Физика полёта (трение, снос, дальность) — phraseBubbleFlight.js; длительность — EXPLODE_MS. Разлёт НЕ ограничен живыми
// соседями: частицы летят поверх них (порядок слоёв — drawExplode), ограничивает только край холста взрыва

// Сдвиг всех шариков (холст взрыва шире постоянного — координаты переезжают на новые поля). Границы облачков (b.lim) —
// один объект на облачко: сдвигаются вместе с шариками, каждая ровно один раз
export function shiftBubbles(list, dx, dy) {
  const lims = new Set()
  for (const b of list) {
    b.ax += dx; b.ay += dy
    if (b.lim && !lims.has(b.lim)) {
      lims.add(b.lim)
      b.lim.x0 += dx; b.lim.x1 += dx; b.lim.y0 += dy; b.lim.y1 += dy
    }
  }
}

// Скорости для набора шариков (одно облачко): каждый летит от центра (cx, cy) с разбросом угла и силы; границы разлёта
// (limitFlight; сейчас бесконечные) учтены сразу. Тяжёлая часть запуска (тригонометрия + предсказание дальности) — её зовут заранее, в простое,
// а на старте облачка остаётся startBubbles
export function prepareBubbles(list, cx, cy) {
  for (const b of list) {
    const angle = Math.atan2(b.ay - cy, b.ax - cx) + (Math.random() - 0.5) * 0.7
    const power = EXPLODE_POWER_MIN + Math.random() * (EXPLODE_POWER_MAX - EXPLODE_POWER_MIN)
    b.vx = Math.cos(angle) * power * EXPLODE_VX_BOOST
    b.vy = Math.sin(angle) * power - EXPLODE_LIFT
    b.t = 0
    limitFlight(b, cy)
  }
}

// Старт полёта уже подготовленных шариков: t = 0 и в воздух
export function startBubbles(list) {
  for (const b of list) { b.t = 0; b.flying = true }
}

// Подготовка + старт разом (сплошная масса ленты, тесты)
export function launchBubbles(list, cx, cy) {
  prepareBubbles(list, cx, cy)
  startBubbles(list)
}

// Покой без canvas: картинка сетки с ТЕКУЩИХ позиций шариков (drawFloat с
// dt=0 — не двигает, только рисует) в невидимый canvas → PNG data-URL → <img>.
// Живой canvas живёт только у активного слайда видимой ленты; на соседях, под
// уроком и на других вкладках — эта картинка. Бисекция на iPhone показала,
// что даже спящие canvas-элементы (по одному на слайд, dpr=3) делали дёрганой
// системную анимацию сворачивания приложения. Рисуем с текущих позиций и
// продолжаем canvas с тех же фаз — подмена картинка ↔ canvas без скачка
// dx/dy — сдвиг шариков в картинку (по умолчанию 0: холст плавания и картинка покоя в одних координатах). Вызывающий
// ограничивает dpr картинки двумя (PhraseBubbleAnimated.jsx: STILL_DPR_MAX) — декодированная картинка = w·h·dpr²·4 байт
export function renderStillImage(bubbles, w, h, dpr, dx = 0, dy = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, dx * dpr, dy * dpr)
  drawFloat(ctx, bubbles, 0)
  return canvas.toDataURL('image/png')
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
// (ALPHA_BINS штук) и делаем fill() на бакет вместо fill() на шарик. Бакеты — общие массивы (очищаются на каждое облачко),
// без аллокаций на кадр.
// lists — частицы В ВОЗДУХЕ по облачкам: lists[g] — список облачка g (облачка идут слева направо, номер растёт). Порядок слоёв:
// облачки рисуются от ПРАВОГО к левому, самое левое — последним, то есть сверху: левые взорвались раньше и должны лежать
// выше правых, а частицы не «упираются» в соседа (разлёт не ограничен), а летят поверх. Живые (ещё не взорванные) облачки
// рисует вызывающий ДО этого вызова (спрайты, paintExplosion). Догоревшие частицы выбрасываются из списков на месте.
// Сплошная масса ленты — одна группа: drawExplode(ctx, [list], …). Возвращает true, когда в воздухе никого не осталось
const BUCKETS = Array.from({ length: ALPHA_BINS + 1 }, () => [])
export function clearExplodePools() {
  for (const list of BUCKETS) list.length = 0
}
function fillBuckets(ctx) {
  for (let bin = ALPHA_BINS; bin >= 1; bin--) {
    const list = BUCKETS[bin]
    if (!list.length) continue
    ctx.globalAlpha = bin / ALPHA_BINS
    ctx.beginPath()
    for (const b of list) {
      if (b.r < RECT_MAX_R) {
        const s = b.r * RECT_HALF
        ctx.rect(b.ax - s, b.ay - s, s * 2, s * 2)
      } else {
        ctx.moveTo(b.ax + b.r, b.ay)
        ctx.arc(b.ax, b.ay, b.r, 0, Math.PI * 2)
      }
    }
    ctx.fill()
  }
}
export function drawExplode(ctx, lists, dt, w, h) {
  let allDone = true
  // Трение гасит скорость — шарик тормозит и почти останавливается, а не летит по прямой бесконечно (что и упиралось
  // бы в границу). dt один на кадр, поэтому степень считаем раз, а не на каждую частицу
  const decay = EXPLODE_FRICTION_PER_MS ** dt
  const dG = EXPLODE_GRAVITY * dt
  const kPos = dt * EXPLODE_POS_K
  ctx.fillStyle = BUBBLE_COLOR
  for (let g = lists.length - 1; g >= 0; g--) {
    const list = lists[g]
    if (!list || !list.length) continue
    for (const bin of BUCKETS) bin.length = 0
    let kept = 0
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      b.t += dt
      if (b.t >= EXPLODE_MS) continue // догорела — из списка выбрасываем
      list[kept++] = b
      allDone = false
      b.vx *= decay
      b.vy = b.vy * decay + dG
      // sx/sy < 1 — путь урезан границами облачка (limitFlight); у шарика без ограничений их нет
      b.ax += b.vx * kPos * (b.sx ?? 1)
      b.ay += b.vy * kPos * (b.sy ?? 1)
      clampToLim(b)
      // Страховка: не дальше края холста (прозрачной к краю частица становится раньше — edgeAlpha ниже)
      if (b.ax < 0) b.ax = 0; else if (b.ax > w) b.ax = w
      if (b.ay < 0) b.ay = 0; else if (b.ay > h) b.ay = h
      // Прозрачность падает к концу пути: время жизни и расстояние до края холста
      const timeAlpha = Math.max(0, 1 - (Math.max(0, b.t) / EXPLODE_MS) ** 1.5)
      // Доп. затухание по расстоянию до границы холста — гарантирует, что альфа уйдёт в 0 раньше, чем шарик долетит до края
      const distToEdge = Math.min(b.ax, w - b.ax, b.ay, h - b.ay)
      const edgeAlpha = Math.max(0, Math.min(1, distToEdge / EXPLODE_FADE_ZONE))
      const alpha = timeAlpha * edgeAlpha
      if (!(alpha > 0.01)) continue // и NaN: бакета под него нет
      BUCKETS[Math.round(alpha * ALPHA_BINS)].push(b)
    }
    list.length = kept
    fillBuckets(ctx)
  }
  ctx.globalAlpha = 1
  return allDone
}
