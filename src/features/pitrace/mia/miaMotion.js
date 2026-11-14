// Движение эпизода «Мия» (прототип): чистые функции времени без DOM — поза коробки (падение, пружина, паника, прогиб под Мией, уход), глаза Пита в прорези,
// путь Мии (прыжок из-за экрана и посадка на крышку, бросок при уходе) и громкость речи Пита для звуковых линий. Время t — секунды от прихода (arrivalAt)
// или от начала ухода (leaveAt). Положение в пикселях считает RaceMia.jsx: здесь только безразмерное (dy — в «высотах коробки» ВЫСОТА_КОРОБКИ, смещения dx в пикселях
// при масштабе 1 — умножаются на масштаб экрана).
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const eOut3 = p => 1 - (1 - p) ** 3
const eIn3 = p => p ** 3
const eIO3 = p => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)
const eBack = p => { const c = 1.70158; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2 }
export const easing = { eOut3, eIn3, eIO3, eBack }

// Приход (с): коробка падает → удар → глаза открываются → короткая паника → Мия прыгает на крышку → прогиб, Пит зажмуривается ненадолго
export const ARR = { FALL0: 0.15, FALL: 0.8, EYES: 1.35, PANIC0: 1.75, JUMP: 3.9, JUMP_LEN: 0.42 }
export const IMPACT = ARR.FALL0 + ARR.FALL
export const LAND = ARR.JUMP + ARR.JUMP_LEN
export const ARRIVAL_END = LAND + 1.2
const PANIC = [[-1, 0.2], [1, 0.34], [-1, 0.32], [0.9, 0.3], [-0.7, 0.26], [0.4, 0.22], [0, 0.2]]  // Пит в коробке мечется влево-вправо (до прыжка Мии ≈ 1,9 с): [куда (доля 1 = ширина размаха), сколько секунд]
const PANIC_PX = 74                                                                            // размах паники при масштабе 1, пикселей
const panicX = t => { let t0 = ARR.PANIC0, x0 = 0; for (const [x1, d] of PANIC) { if (t <= t0 + d) return PANIC_PX * (x0 + (x1 - x0) * eIO3(clamp((t - t0) / d))); t0 += d + 0.04; x0 = x1 } return 0 }

const hsh = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }
/** Живые глаза Пита в щели (в покое, прототип 2026-11-14): взгляд быстро перескакивает на новую точку раз в ≈1,9 с и чуть дрейфует, раз в ≈3,4 с — быстрое моргание. → { look (ед. грани), blink (множитель раскрытия 0…1) } */
export function eyeLife(t) {
  const SEG = 1.9, i = Math.floor(t / SEG), ph = t - i * SEG, tg = k => (hsh(k * 3.17 + 1) - 0.5) * 9
  const look = tg(i - 1) + (tg(i) - tg(i - 1)) * eOut3(clamp(ph / 0.09)) + 0.5 * Math.sin(t * 1.9)
  const BL = 3.4, j = Math.floor(t / BL), at = j * BL + hsh(j * 7.7) * (BL - 0.4), dt = t - at
  return { look, blink: dt >= 0 && dt < 0.16 ? 1 - 0.96 * Math.sin(Math.PI * dt / 0.16) : 1 }
}

/** Поза прихода в момент t: { box: { dy (в высотах экрана ×1, <0 — выше), dx (px при масштабе 1), rot (°), sx, sy, thNear, thFar }, eyes: { open, scale, look }, mia: { mode, u, rot, sx, sy }, hideCat } */
export function arrivalAt(t) {
  const box = { dy: 0, dx: 0, dxw: 0, rot: 0, sx: 1, sy: 1, thNear: 0, thFar: 0 }, eyes = { open: 0, scale: 1, look: 0 }, mia = { mode: 'off', u: 0, rot: 0, sx: 1, sy: 1 }
  if (t < ARR.FALL0) return { box, eyes, mia, hideCat: false, shown: false }
  const fall = clamp((t - ARR.FALL0) / ARR.FALL), q = t - IMPACT
  if (q < 0) {                                                  // падение: ускоряется, клапаны задираются воздухом
    const p = clamp((t - ARR.FALL0) / 0.2)
    Object.assign(box, { dy: -(1 - fall * fall), dx: 35 * (1 - fall) ** 2, rot: -9 * (1 - fall) ** 2 + 2 * Math.sin(2 * Math.PI * 3 * t) * (1 - fall), sy: 1 + 0.05 * fall, sx: 1 - 0.025 * fall,
      thNear: 62 * eOut3(p) + 5 * Math.sin(2 * Math.PI * 8 * t) * p, thFar: 55 * eOut3(p) + 6 * Math.sin(2 * Math.PI * 7 * t + 1) * p })
    return { box, eyes, mia, hideCat: false, shown: true }
  }
  const sq = Math.exp(-9 * q) * Math.cos(22 * q)                // удар: сжатие пружиной, клапаны шлёпаются на пол с отскоком
  Object.assign(box, { sy: 1 - 0.13 * sq, sx: 1 + 0.07 * sq, rot: 3.5 * Math.exp(-8 * q) * Math.sin(26 * q), thNear: Math.max(0, 62 * Math.exp(-9 * q) * Math.cos(15 * q)), thFar: Math.max(0, 55 * Math.exp(-9 * q) * Math.cos(15 * q + 0.4)) })
  if (t >= ARR.EYES) eyes.open = eBack(clamp((t - ARR.EYES) / 0.25))
  if (t >= ARR.PANIC0) {
    const x = panicX(t), v = (panicX(t + 0.01) - panicX(t - 0.01)) / 0.02, vn = clamp(v / (PANIC_PX * 18), -1, 1)
    box.dx += x; box.rot += vn * 7; box.sx *= 1 + 0.04 * Math.abs(vn); eyes.look = 5 * vn; eyes.scale = 1 + 0.1 * Math.abs(vn)
  }
  if (t >= ARR.JUMP) {                                          // Мия: прыжок из-за правого края и посадка на крышку
    const u = clamp((t - ARR.JUMP) / ARR.JUMP_LEN)
    if (t < LAND) Object.assign(mia, { mode: 'flight', u, rot: -48 * (1 - u) ** 2, sy: 1 + 0.16 * Math.sin(Math.PI * u), sx: 1 - 0.08 * Math.sin(Math.PI * u) })
    else {
      const l = t - LAND, sag = (1 - Math.exp(-l * 50)) * Math.exp(-9 * l) * Math.cos(20 * l), k = (1 - Math.exp(-l * 50)) * Math.exp(-10 * l) * Math.cos(24 * l)
      box.sy *= 1 - 0.12 * sag; box.sx *= 1 + 0.05 * sag
      box.thNear = Math.max(box.thNear, 26 * Math.exp(-11 * l) * Math.abs(Math.sin(14 * l))); box.thFar = Math.max(box.thFar, 12 * Math.exp(-11 * l) * Math.abs(Math.sin(14 * l + 0.5)))
      Object.assign(mia, { mode: 'seat', u: 1, sy: 1 - 0.24 * k, sx: 1 + 0.12 * k, rot: box.rot * 0.6 })
      const close = eOut3(clamp(l / 0.08)), reopen = clamp((l - 0.5) / 0.3)   // Пит зажмуривается ненадолго (вес Мии), потом открывает глаза
      eyes.open = reopen > 0 ? 0.05 + 0.95 * eBack(reopen) : 1 - 0.95 * close
    }
  }
  if (t >= LAND + 0.9) { const L = eyeLife(t); eyes.look += L.look; eyes.open *= L.blink }   // глаза живые: взгляд бегает, моргают
  return { box, eyes, mia, hideCat: true, shown: true }
}

// Уход (с): Мия присаживается, коробка трясётся изнутри; Мия подхватывает коробку лапами и отпрыгивает с ней за правый край экрана; голова Пита снова на виду
export const LEAVE = { CROUCH: 0.3, JUMP: 0.95, END: 1.3, CAT_BACK: 0.5 }

/** Поза ухода в момент t: { box (dxw — смещение вправо в долях ширины сцены), eyes, mia: { mode: 'seat' | 'off' } — Мия едет на коробке, держа её лапами }, hideCat, shown } */
export function leaveAt(t) {
  const box = { dy: 0, dx: 0, dxw: 0, rot: 0, sx: 1, sy: 1, thNear: 0, thFar: 0 }, eyes = { open: 1, scale: 1, look: 0 }, mia = { mode: 'seat', u: 1, rot: 0, sx: 1, sy: 1 }
  if (t >= LEAVE.END) return { box, eyes, mia: { ...mia, mode: 'off' }, hideCat: false, shown: false }
  const cr = clamp(t / LEAVE.CROUCH)                            // присела: коробка дрожит (Пит рвётся наружу), Мия сжимается пружиной
  box.dx = 1.5 * Math.sin(2 * Math.PI * 9 * t) * cr; box.rot = 0.9 * Math.sin(2 * Math.PI * 7 * t + 1) * cr; box.sy = 1 - 0.015 * Math.abs(Math.sin(2 * Math.PI * 6 * t)) * cr  // дрожь коробки мелкая и медленная: Мия на ней не трясётся
  Object.assign(mia, { sy: 1 - 0.14 * cr, sx: 1 + 0.06 * cr, rot: 0 })
  eyes.open = 1 - 0.98 * eOut3(clamp((t - 0.12) / 0.18))        // Мия берёт коробку: глаза в щели закрываются и остаются закрытыми, пока коробка летит
  if (t >= LEAVE.CROUCH) {                                       // прыжок: вверх и вправо за экран, коробка в лапах — клапаны трепыхаются
    const u = clamp((t - LEAVE.CROUCH) / LEAVE.JUMP)
    box.dxw = 1.35 * u * u; box.dy = -0.5 * u * (2 - u); box.dx = 0; box.rot = 14 * eOut3(u); box.sy = 1 + 0.05 * u
    box.thNear = 35 + 8 * Math.sin(2 * Math.PI * 4 * t); box.thFar = 30 + 7 * Math.sin(2 * Math.PI * 3 * t + 1)
    Object.assign(mia, { sy: 0.86 + 0.2 * eOut3(clamp(u * 3)), sx: 1.06 - 0.1 * eOut3(clamp(u * 3)), rot: box.rot * 0.5 })   // полёт плавный: без дрожи, Мия держит коробку ровно
  }
  return { box, eyes, mia, hideCat: t < LEAVE.CAT_BACK, shown: true }
}

/** Громкость речи Пита 0…1 по форме рта головы (Rhubarb A…H, X или closed / half / open) — звуковые линии идут в такт его реальной озвучке */
export const MOUTH_LEVEL = { X: 0, A: 0.08, B: 0.4, C: 0.6, D: 0.95, E: 0.55, F: 0.45, G: 0.35, H: 0.65, closed: 0, half: 0.5, open: 1 }
export const talkLevel = (vis, mouth) => MOUTH_LEVEL[vis] ?? MOUTH_LEVEL[mouth] ?? 0

/** Путь Мии при прыжке: из-за правого края (x0) по дуге в точку посадки; u 0…1 → линейный x и дуга по y (подъём apex над хордой, доли высоты экрана) */
export const flightPath = (u, from, to, apex = 0.22) => { const p = u ** 1.5; return { x: from[0] + (to[0] - from[0]) * p, y: from[1] + (to[1] - from[1]) * p - apex * 4 * p * (1 - p) } } // «агрессивный» прыжок: летит всё быстрее к крышке (p = u^1,5), дуга ниже и резче, посадка с ударом
