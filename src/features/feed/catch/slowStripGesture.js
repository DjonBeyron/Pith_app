// Жест в правой полосе замедления «Ловли слов» (FeedSlowStrip): короткое касание — пауза видео (как тап по видео
// в обычном режиме), удержание — замедление 0.5x (тот же useSlowMotion, что у зоны над лайком). Чистые правила.
export const STRIP_HOLD_MS = 200 // удержали дольше — это замедление; короче и без сдвига — тап (пауза)
export const STRIP_MOVE_PX = 12 // палец ушёл дальше — не тап (свайп/мазок): ни паузы, ни замедления
export const STRIP_WIDTH_PCT = 20 // ширина полосы: пятая часть ширины слайда (feed-slow-strip.css, страж — slowStripCss.test.js)

// Палец сместился от точки касания настолько, что это уже не тап и не удержание на месте
export const movedFar = (dx, dy) => Math.hypot(dx, dy) > STRIP_MOVE_PX

// Что сделать при отпускании: holding — замедление уже включилось по таймеру; иначе короткое касание без сдвига — пауза
export function releaseAction({ holding, heldMs, moved, canceled = false }) {
  if (holding) return 'endHold'
  if (canceled || moved) return 'none'
  return heldMs < STRIP_HOLD_MS ? 'tap' : 'none'
}
