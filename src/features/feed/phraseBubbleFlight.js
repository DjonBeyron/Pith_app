// Полёт частиц взрыва облачка (без React и без canvas): физика кадра, предсказание дальности и ограничение разлёта
// в сторону ещё живого соседа. Рисует и двигает частицы drawExplode (phraseBubbleDraw.js); здесь — общие константы физики и
// то, что считается ОДИН раз на облачко (prepareBubbles — заранее, в простое, см. phraseBubbleWarm.js) и при
// прореживании (thinForLaunch).
//
// Ограничение: облачка взрываются слева направо, поэтому для облачка i слева все соседи уже растворились, а справа ещё живы.
// У каждой частицы есть границы lim { x0, x1, y0, y1 } (flightLimits в phraseBubbleRegions.js): только в сторону ЖИВОГО
// соседа — слово + ALIVE_REACH зазора, в остальные стороны ±Infinity (внешние края фразы и растворившиеся соседи — свободно,
// как у спойлера ленты; дальше край холста взрыва фиксирует затухание в drawExplode). Если путь частицы упирается в границу, по
// скорости предсказывается весь полёт (flightExtent, тот же шаг физики) и путь по оси масштабируется (b.sx, b.sy) так, чтобы
// закончиться не дальше границы; потерянная горизонтальная скорость уходит в вертикаль лишь частично (LOST_TO_VERTICAL), а
// не целиком: облачко рассыпается и вбок, и вверх-вниз. drawExplode зажимает положение в lim как страховку от шума dt.

import { EXPLODE_SLOW, EXPLODE_MS } from './phraseBubbleConsts.js'

export const EXPLODE_POWER_MIN = 6 / EXPLODE_SLOW
export const EXPLODE_POWER_MAX = 14 / EXPLODE_SLOW
export const EXPLODE_FRICTION_PER_MS = 0.992 ** (1 / EXPLODE_SLOW) // трение гасит скорость: частица тормозит, а не летит бесконечно
export const EXPLODE_GRAVITY = 0.01 / (EXPLODE_SLOW * EXPLODE_SLOW) // лёгкий снос вниз
export const EXPLODE_LIFT = 2 / EXPLODE_SLOW                       // начальный подъём (вычитается из vy)
export const EXPLODE_POS_K = 0.06                                  // скорость → пиксели за мс
const PREDICT_STEP_MS = 16
const LOST_TO_VERTICAL = 0.5 // доля потерянной из-за границы горизонтальной скорости, уходящая в вертикаль (остальное просто гаснет)
const WALL_SPREAD = 0.4      // частицы, упёршиеся в границу, останавливаются на 60-100% доступного пути — не выстраиваются «стеной» на границе
// Верхняя граница числа живых частиц на весь холст одновременно (облачко запускается прореженным, если не влезает)
export const MAX_PARTICLES = 450
const MIN_GROUP = 60 // и всё же не меньше стольких частиц на облачко

// Крайние смещения полёта за всю жизнь частицы от точки запуска при скорости (vx, vy): тот же шаг физики, что в drawExplode
export function flightExtent(vx, vy) {
  const decay = EXPLODE_FRICTION_PER_MS ** PREDICT_STEP_MS
  let x = 0, y = 0, xMin = 0, xMax = 0, yMin = 0, yMax = 0
  for (let t = 0; t < EXPLODE_MS; t += PREDICT_STEP_MS) {
    vx *= decay
    vy = vy * decay + EXPLODE_GRAVITY * PREDICT_STEP_MS
    x += vx * PREDICT_STEP_MS * EXPLODE_POS_K
    y += vy * PREDICT_STEP_MS * EXPLODE_POS_K
    if (x < xMin) xMin = x; else if (x > xMax) xMax = x
    if (y < yMin) yMin = y; else if (y > yMax) yMax = y
  }
  return { xMin, xMax, yMin, yMax }
}

// Масштаб пути (0..1) по одной оси: lo/hi — крайние смещения (lo ≤ 0 ≤ hi), roomLo/roomHi — сколько места до границы
function axisScale(lo, hi, roomLo, roomHi) {
  let s = 1
  if (hi > 0 && hi > roomHi) s = Math.min(s, Math.max(0, roomHi) / hi)
  if (lo < 0 && -lo > roomLo) s = Math.min(s, Math.max(0, roomLo) / -lo)
  return s
}

const isFin = v => v > -Infinity && v < Infinity

// Ограничить полёт частицы b границами b.lim (после того как у неё выставлены vx, vy): пишет b.sx, b.sy — множители пути
// по осям. cy — центр облачка по вертикали: часть заблокированной по горизонтали скорости уходит вверх/вниз по сторону от
// него. Сторона без конечной границы (нет живого соседа) не считается вовсе — у такого облачка дальность не предсказываем
export function limitFlight(b, cy) {
  b.sx = 1
  b.sy = 1
  const lim = b.lim
  if (!lim) return
  const limX = isFin(lim.x0) || isFin(lim.x1)
  const limY = isFin(lim.y0) || isFin(lim.y1)
  if (!limX && !limY) return
  let ext = flightExtent(b.vx, b.vy)
  if (limX) {
    b.sx = axisScale(ext.xMin, ext.xMax, b.ax - b.r - lim.x0, lim.x1 - b.r - b.ax)
    if (b.sx < 1) {
      b.sx *= 1 - WALL_SPREAD * Math.random()
      b.vy += (b.ay < cy ? -1 : 1) * Math.abs(b.vx) * (1 - b.sx) * LOST_TO_VERTICAL
      if (limY) ext = flightExtent(b.vx, b.vy)
    }
  }
  if (limY) b.sy = axisScale(ext.yMin, ext.yMax, b.ay - b.r - lim.y0, lim.y1 - b.r - b.ay)
}

// Положение частицы в её границах (центр не ближе радиуса к границе); страховка от разных dt кадров. Нет lim — не трогаем
export function clampToLim(b) {
  const lim = b.lim
  if (!lim) return
  const lox = lim.x0 + b.r, hix = lim.x1 - b.r, loy = lim.y0 + b.r, hiy = lim.y1 - b.r
  if (lox <= hix) b.ax = Math.max(lox, Math.min(hix, b.ax))
  if (loy <= hiy) b.ay = Math.max(loy, Math.min(hiy, b.ay))
}

// Прореживание запускаемого облачка: alive — сколько частиц уже в воздухе (других облачков). Влезает в MAX_PARTICLES —
// список как есть; иначе равномерная выборка по сетке ровно на room частиц (но не меньше MIN_GROUP). Остальные из облачка просто пропадают
// в момент взрыва (их не рисуем) — облачко разлетается чуть реже, а кадр не тяжелеет
export function thinForLaunch(list, alive, max = MAX_PARTICLES) {
  const room = Math.max(MIN_GROUP, max - alive)
  if (list.length <= room) return list
  const stride = list.length / room
  return Array.from({ length: room }, (_, i) => list[Math.floor(i * stride)])
}
