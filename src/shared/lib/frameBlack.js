// Детектор «чёрного кадра» для стоп-кадров и canvas-зеркала видео.
//
// На Android с аппаратным декодером drawImage(video) сразу после
// loadeddata/seeked часто отдаёт ЧЁРНЫЙ кадр: декодер кадр уже выдал, а
// презентован он ещё не был. Такой кадр нельзя ни сохранять постером, ни
// рисовать зеркалом поверх скелетона — круг выглядит «не пустым, но чёрным».
//
// Чёрный = почти нулевая средняя яркость И почти нулевой разброс (тёмная
// сцена с бликом — не чёрная). Полностью прозрачный кадр (ничего не нарисовано
// / canvas «tainted») тоже считается чёрным.
export const BLACK_MEAN = 6      // средняя яркость 0..255
export const BLACK_SPREAD = 16   // max - min яркости

// rgba — Uint8ClampedArray из getImageData. Пустой/неизвестный вход — не чёрный:
// детектор не должен выбрасывать кадры, когда не смог их прочитать
export function isBlackFrame(rgba) {
  if (!rgba || rgba.length < 4) return false
  let sum = 0, min = 255, max = 0, n = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue // прозрачный пиксель — ничего не нарисовано
    const y = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    sum += y; n++
    if (y < min) min = y
    if (y > max) max = y
  }
  if (n === 0) return true
  return sum / n < BLACK_MEAN && max - min < BLACK_SPREAD
}

// В какие моменты пробовать снять кадр: сперва нужный (first — обычно 0:
// ровно тот кадр, с которого живое видео стартует), потом чуть дальше — первый
// кадр у многих роликов чёрный (fade-in). Не выходит за конец короткого видео,
// близкие друг к другу времена не повторяются
export function pickPosterTimes(duration, first = 0) {
  const known = Number.isFinite(duration) && duration > 0
  const limit = known ? Math.max(0, duration - 0.05) : Infinity
  const raw = [first, 0.1, 0.3, 0.6, known ? duration / 2 : null]
  const out = []
  for (const t of raw) {
    if (t == null || t < 0 || t > limit) continue
    if (out.some(p => Math.abs(p - t) < 0.05)) continue
    out.push(t)
  }
  return out.length ? out : [0]
}

let scratch = null

// Рисует источник (video/canvas/img) в 8×8 и проверяет на чёрное. Любой сбой
// (нет canvas, tainted, источник не готов) — «не чёрный»: пусть решает вызывающий
export function frameLooksBlack(source) {
  try {
    if (!scratch) {
      const c = document.createElement('canvas')
      c.width = 8; c.height = 8
      scratch = { c, ctx: c.getContext('2d', { willReadFrequently: true }) }
    }
    scratch.ctx.clearRect(0, 0, 8, 8)
    scratch.ctx.drawImage(source, 0, 0, 8, 8)
    return isBlackFrame(scratch.ctx.getImageData(0, 0, 8, 8).data)
  } catch {
    return false
  }
}
