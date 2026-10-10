// Автопоказ попапа разрешения в модуле «Сказать фразу» (чистая логика, без React): через секунду после появления модуля попап САМ появляется над панелью.
// Микрофон при этом не трогаем: попап только ПОКАЗЫВАЕТСЯ, а запрос разрешения и старт записи идут по нажатию кнопки внутри него (жест пользователя → begin()).
export const AUTO_POPUP_MS = 1000

/**
 * Нужно ли сейчас (после паузы) показать попап сам. Те же условия, по которым тап на круг открыл бы попап: кнопка locked и решение sayPermission — explain.
 *  visible — панель смонтирована и показана; closing — панель уходит; phase — фаза sayFlow (только idle: не идёт попап/запись/итог, не запасной режим);
 *  taps — сколько раз уже нажимали на круг (нажал — автопоказа нет); micState — вид кнопки (sayMicState); decision — sayPermission.decide() (denied / Firefox / не поддерживается / «не могу говорить» дают fallback).
 */
export function autoPopupWanted({ visible, closing = false, phase, taps = 0, micState, decision }) {
  if (!visible || closing || taps > 0) return false
  return phase === 'idle' && micState === 'locked' && decision?.action === 'explain'
}

/** Сколько ещё ждать до показа, если модуль появился elapsedMs назад (0 — пора) */
export const autoPopupDelay = elapsedMs => Math.max(0, AUTO_POPUP_MS - Math.max(0, elapsedMs))
