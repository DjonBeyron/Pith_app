// Конвейер дорожек в пикселях экрана (v3.3.133): модель (wordLaneConveyor.js) считает сдвиг узора в dvh, а привод (laneConveyorDrive.js) пишет его в CSS уже в px, привязанных к пикселям устройства.
// Зачем: дробный сдвиг translate3d (было `--run-y: 12.37dvh`) каждый кадр попадал между пикселями — слой пересэмплировался, тонкая нить и узелки «дрожали»; период узора в CSS (51,6 dvh) и в JS считались от разных
// «dvh» (iOS: адресная строка меняет dvh) — шов на оборачивании прыгал. Теперь период тоже пишет привод (`--run-px`, из того же innerHeight), он кратен `split` пикселям устройства (у гонки — 24: шаг нити
// период/24 и шаг узелков период/3 — целые пиксели устройства, повторы фона ложатся одинаково на каждом кадре), а сдвиг — доля периода, округлённая до 1/devicePixelRatio. Чистые функции, без DOM.

/** Один пиксель устройства в CSS px */
const unitOf = dpr => 1 / (dpr > 0 ? dpr : 1)

/** Округление до пикселя устройства */
export const snap = (v, dpr) => Math.round(v / unitOf(dpr)) * unitOf(dpr)

/** Период узора в CSS px: perDvh от высоты экрана h (px), кратный split пикселям устройства (не меньше одного такого шага) */
export function periodPx(perDvh, h, dpr, split = 1) {
  const step = split * unitOf(dpr)
  return Math.max(1, Math.round((perDvh * h) / 100 / step)) * step
}

/** Сдвиг узора в CSS px: y (dvh, 0…perDvh — из модели) как доля периода P (px), до пикселя устройства; ровно P — это 0 (шов бесшовный) */
export function shiftPx(y, perDvh, P, dpr) {
  const v = snap((y / perDvh) * P, dpr)
  return v >= P - 1e-6 || v < 0 ? 0 : v
}

/** Строка для CSS: 3 знака хватает (ошибка ≤ 0,001 px — меньше тысячной пикселя устройства), без «-0» */
export const pxText = v => `${(Math.abs(v) < 5e-4 ? 0 : v).toFixed(3)}px`

/** Высота экрана и плотность пикселей: innerHeight — та же высота, что у dvh в момент чтения (кэшируется приводом, обновляется по resize) */
export const viewOf = (g = globalThis) => ({ h: g.innerHeight > 0 ? g.innerHeight : 800, dpr: g.devicePixelRatio > 0 ? g.devicePixelRatio : 1 })
