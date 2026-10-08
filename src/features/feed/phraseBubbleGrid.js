// Сборка сетки шариков-спойлера (без React и без canvas): узлы одного прямоугольника (сетка + бахрома) и buildGrid —
// сплошная масса для ленты или облачка по словам для «Ловли слов». Отрисовка и взрыв — phraseBubbleDraw.js, константы —
// phraseBubbleConsts.js, геометрия регионов — phraseBubbleRegions.js.

import { padRegions, regionLimits } from './phraseBubbleRegions.js'
import {
  SPACING, RADIUS, AMP_MAX, PULSE_AMP, WANDER_Y_SCALE, WIGGLE_SECOND_RATIO,
  FRINGE_DEPTH_MAX, FRINGE_DEPTH_MAX_Y, MARGIN_X, MARGIN_Y, REGION_DENSITY, REGION_RADIUS_SCALE,
} from './phraseBubbleConsts.js'

// Режим «облачка по словам» (regions): шарики колеблются слабее и бахрома мельче, чтобы облачко не заплывало на соседа
const REGION_WANDER_SCALE = 0.35
const REGION_FRINGE_SCALE = 0.45
const FRINGE_DENSITY = 1.4 // узлов бахромы на SPACING длины края
const MIN_FRINGE_DEPTH = 0.3 // глубже этого бахромы с края нет смысла — сторона без бахромы

// Узлы одного прямоугольника (x0, y0, w, h — относительно текстового блока): сетка + бахрома. region — номер облачка
// (null у сплошной ленты; у облачка узлов в REGION_DENSITY раз меньше — шаг сетки больше, бахромы меньше). caps — сколько px бахрома может выйти за прямоугольник с каждой стороны ({ l, r, t, b },
// Infinity — без ограничения): у стороны, где вплотную сосед, бахромы нет совсем
function rectNodes(push, x0, y0, contentW, contentH, region, caps) {
  const density = region == null ? 1 : REGION_DENSITY
  const step = SPACING / Math.sqrt(density)
  const cols = Math.ceil(contentW / step) + 1
  const rows = Math.ceil(contentH / step) + 1
  const jitter = step * 0.55
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const offsetX = (ry % 2) * (step / 2)
      push(
        MARGIN_X + x0 + rx * step + offsetX - step / 2 + (Math.random() - 0.5) * jitter,
        MARGIN_Y + y0 + ry * step - step / 2 + (Math.random() - 0.5) * jitter,
        1,
        region,
      )
    }
  }

  // Бахрома: точки вдоль каждой стороны прямоугольника, сдвинутые наружу по нормали на случайную глубину (чаще у самого
  // края, реже подальше — произведение двух random() даёт спад плотности) плюс случайный сдвиг вдоль края. Шарики бахромы
  // чуть мельче — истончаются к краю. Верх/низ — глубина меньше (тоньше по высоте). Бахрома идёт вокруг КАЖДОГО облачка
  // отдельно; глубина стороны не больше caps — число точек падает пропорционально (плотность та же)
  const depthScale = region == null ? 1 : REGION_FRINGE_SCALE
  const sides = [
    { len: contentW, nx: 0, ny: -1, full: FRINGE_DEPTH_MAX_Y, cap: caps.t },
    { len: contentH, nx: 1, ny: 0, full: FRINGE_DEPTH_MAX, cap: caps.r },
    { len: contentW, nx: 0, ny: 1, full: FRINGE_DEPTH_MAX_Y, cap: caps.b },
    { len: contentH, nx: -1, ny: 0, full: FRINGE_DEPTH_MAX, cap: caps.l },
  ]
  for (const s of sides) {
    const fullDepth = s.full * depthScale
    const depthMax = Math.min(fullDepth, s.cap)
    if (depthMax < MIN_FRINGE_DEPTH) continue
    const count = Math.round((s.len / SPACING) * FRINGE_DENSITY * density * (depthMax / fullDepth))
    for (let i = 0; i < count; i++) {
      const along = Math.random() * s.len
      const x = s.ny !== 0 ? along : s.nx > 0 ? contentW : 0
      const y = s.ny !== 0 ? (s.ny > 0 ? contentH : 0) : along
      const depth = Math.random() * Math.random() * depthMax
      const tangentJitter = (Math.random() - 0.5) * SPACING * 1.5
      push(
        MARGIN_X + x0 + x + s.nx * depth - s.ny * tangentJitter,
        MARGIN_Y + y0 + y + s.ny * depth + s.nx * tangentJitter,
        0.55 + Math.random() * 0.5,
        region,
      )
    }
  }
}

// Предельная амплитуда покачивания узла внутри границ облачка lim ({ x0, x1, y0, y1 } в координатах текстового блока):
// шарик на пике (радиус с дыханием + размах двух синусоид, по вертикали слабее) не должен выйти за границу. null —
// даже неподвижный шарик за границей (узел отбрасывается)
function fitAmp(lim, cx, cy, r, amp) {
  const rPeak = r * (1 + PULSE_AMP)
  const roomX = Math.min(cx - lim.x0, lim.x1 - cx) - rPeak
  const roomY = Math.min(cy - lim.y0, lim.y1 - cy) - rPeak
  if (roomX < 0 || roomY < 0) return null
  const k = 1 + WIGGLE_SECOND_RATIO
  return Math.min(amp, roomX / k, roomY / (k * WANDER_Y_SCALE))
}

// contentW/H — размер самого текста (без MARGIN); координаты шариков сразу смещены на MARGIN, чтобы попасть в систему
// координат холста. Джиттер узла сетки + разброс радиуса уводят рисунок от ровного растра — читается как абстрактное
// скопление. По периметру рассеяна «бахрома» — без неё силуэт читался бы как прямоугольник с явными углами.
// regions (необязательно) — прямоугольники слов { x, y, w, h } относительно текстового блока: узлы генерируются только
// внутри каждого прямоугольника (padRegions — с запасом) и его бахромы, у шариков поле region = номер облачка.
// Облачко не заходит за середину зазора до соседа: узлы за границей regionLimits отбрасываются, амплитуда покачивания
// у остальных прижата так, чтобы шарик на пике (радиус + дыхание + размах) оставался внутри — слова остаются отдельными
// облачками, а не слипаются в массу. Без regions — одна сплошная масса, как в ленте
export function buildGrid(contentW, contentH, regions = null) {
  const bubbles = []
  const byRegion = Array.isArray(regions)
  let lim = null
  let flightLim = null // те же границы в координатах холста (MARGIN) — на шарике, для разлёта при взрыве (phraseBubbleFlight.js)
  const push = (ax, ay, sizeScale, region) => {
    const r = RADIUS * sizeScale * (0.6 + Math.random() * 0.8) * (byRegion ? REGION_RADIUS_SCALE : 1)
    let amp = (1.3 + Math.random() * (AMP_MAX - 1.3)) * (byRegion ? REGION_WANDER_SCALE : 1)
    if (byRegion) {
      amp = fitAmp(lim, ax - MARGIN_X, ay - MARGIN_Y, r, amp)
      if (amp == null) return
    }
    bubbles.push({
      ax,
      ay,
      r,
      phase: Math.random() * Math.PI * 2,
      speed: 0.7 + Math.random() * 0.5,
      amp,
      pulseOffset: Math.random() * Math.PI * 2,
      vx: 0,
      vy: 0,
      t: 0,
      region: byRegion ? region : null,
      lim: flightLim,
      sx: 1,
      sy: 1,
      flying: false,
    })
  }
  if (byRegion) {
    const limits = regionLimits(regions)
    padRegions(regions).forEach((p, i) => {
      lim = limits[i]
      flightLim = { x0: lim.x0 + MARGIN_X, x1: lim.x1 + MARGIN_X, y0: lim.y0 + MARGIN_Y, y1: lim.y1 + MARGIN_Y }
      const caps = {
        l: Math.max(0, p.x - lim.x0), r: Math.max(0, lim.x1 - (p.x + p.w)),
        t: Math.max(0, p.y - lim.y0), b: Math.max(0, lim.y1 - (p.y + p.h)),
      }
      rectNodes(push, p.x, p.y, p.w, p.h, i, caps)
    })
  } else {
    rectNodes(push, 0, 0, contentW, contentH, null, { l: Infinity, r: Infinity, t: Infinity, b: Infinity })
  }
  return bubbles
}
