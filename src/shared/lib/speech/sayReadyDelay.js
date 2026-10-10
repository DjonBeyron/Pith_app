// Отложенный ПОКАЗ состояния «доступ выдан» (locked → ready) у круга-микрофона «Сказать фразу». Чистая логика, без React и DOM. ТОЛЬКО ВИЗУАЛЬНАЯ задержка:
// sayPermission.decide(), флаги и тапы работают сразу по настоящему состоянию (micVisualState), круг лишь позже «зеленеет» — сразу после системного диалога
// перечёркивание/кольцо/размер меняются у ученика «на глазах», а не пока диалог ещё закрывается и внимание не вернулось в приложение.
// Задерживается ТОЛЬКО переход locked → ready. Всё остальное — сразу: монтирование с уже выданным доступом (shown стартует равным target), active/done/off, отзыв доступа (ready → locked/off).
//  iPhone — отсчёт READY_DELAY_MS от ПОСЛЕДНЕГО из двух событий: «цель стала ready» (ответ Permissions API / успешный старт микрофона) и «приложение вернулось» (focus /
//           visibilitychange → visible: диалог iOS закрыт). Пока приложение скрыто — ждём возврата (left = null).
//  Android — системного шага возврата нет: просто отсечка READY_DELAY_MS после того, как цель стала ready.
export const READY_DELAY_MS = 700

/**
 * Нужно ли удерживать показ: показан серый locked, а настоящее состояние уже ready (единственный задерживаемый переход).
 * settled — Permissions API уже ответил (sayPermission.isChecked): пока он молчит, ready — это «доступ уже был», а не «только что выдали» (монтирование с выданным доступом — без задержки)
 */
export const holdsReady = ({ shown, target, settled = true }) => settled && shown === 'locked' && target === 'ready'

/**
 * Сколько мс ещё ждать до показа ready (0 — пора, null — ждать возврата в приложение).
 *  ios — iPhone/iPad; readyAt — когда настоящее состояние стало ready; backAt — когда приложение в последний раз вернулось (0 — не было);
 *  now — текущее время; visible — приложение сейчас видимо (document.visibilityState === 'visible').
 */
export function readyDelayLeft({ ios = false, readyAt, backAt = 0, now, visible = true }) {
  if (!ios) return Math.max(0, readyAt + READY_DELAY_MS - now)
  if (!visible) return null
  return Math.max(0, Math.max(readyAt, backAt) + READY_DELAY_MS - now)
}
