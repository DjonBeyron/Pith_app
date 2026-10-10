// Отложенный ПОКАЗ состояний круга-микрофона «Сказать фразу» после серого locked (чистая логика, без React и DOM). ТОЛЬКО ВИЗУАЛЬНАЯ задержка: sayPermission.decide(), флаги, тапы и запись
// работают сразу по настоящему состоянию (micVisualState), а ученик видит «зелёное» (круг, значок, кольцо, волны, подпись) только когда доступ подтверждён — не пока системный диалог ещё на экране.
// Задерживаются ровно два перехода из показанного locked:
//  ready  — «доступ выдан» (locked → ready без нажатия: ответ Permissions API, возврат после прерванной записи); отсчёт от появления ready;
//  active — ПЕРВЫЙ запрос доступа: тап в попапе сразу ставит phase 'run' (запись стартует в жесте), но картинка ждёт, пока микрофон реально открылся (view.status === 'listening', то есть
//           пользователь подтвердил диалог), + READY_DELAY_MS. Только если на момент нажатия доступа не было (noAccess); уже выданный доступ, вводный попап без диалога, повторные попытки — без задержки.
//  active после попапа — запись пошла кнопкой попапа БЕЗ системного диалога (доступ уже выдан, вводный попап, Android): картинка стартует через POPUP_DELAY_MS от нажатия (попап успевает закрыться).
//           Если при этом был и диалог (iPhone, первый запрос) — действует то, что позже: «открылся + 700 мс» или «нажатие + POPUP_DELAY_MS». Повторная попытка прямо на круг (shown ready) — без задержки.
// Всё остальное — сразу: монтирование с выданным доступом (shown стартует равным target), done/off (отказ not-allowed → сразу ветка отказа), отзыв доступа (ready → locked/off).
//  iPhone — отсчёт READY_DELAY_MS от ПОСЛЕДНЕГО из двух событий: «можно показывать» (ready появился / микрофон открылся) и «приложение вернулось» (focus / visibilitychange → visible: диалог iOS
//           закрыт). Пока приложение скрыто — ждём возврата (left = null).
//  Android — возврата в приложение нет: просто отсечка READY_DELAY_MS от «можно показывать».
export const READY_DELAY_MS = 700
// Нажали кнопку в попапе разрешения → картинка активации (рост круга, заливка, значок, волны, подпись) стартует НЕ раньше, чем через POPUP_DELAY_MS от нажатия: попап за это время успевает
// закрыться (hudPopupState.EXIT_MS = 340 мс) и ещё остаётся короткая пауза, иначе активация «налезает» на уходящий попап. Запись при этом стартует в жесте, как раньше.
export const POPUP_DELAY_MS = 520

/**
 * Какой переход из показанного locked сейчас удерживаем: 'ready' | 'active' | null.
 *  settled — Permissions API уже ответил (sayPermission.isChecked): пока он молчит, ready — «доступ уже был», а не «только что выдали» (монтирование с выданным доступом — без задержки);
 *  asked — запись началась из locked без доступа (startsAsk, запоминается на момент нажатия: после открытия микрофона флаг доступа уже станет true);
 *  afterPopup — запись началась кнопкой попапа разрешения (startsAfterPopup): картинка ждёт закрытия попапа (POPUP_DELAY_MS), даже если системного диалога нет (доступ уже выдан / Android).
 */
export function holdKind({ shown, target, settled = true, asked = false, afterPopup = false }) {
  if (shown !== 'locked') return null
  if (target === 'ready') return settled ? 'ready' : null
  return target === 'active' && (asked || afterPopup) ? 'active' : null
}

/** Это нажатие — первый запрос доступа: показан серый locked, запись пошла (target active), доступа на этот момент нет */
export const startsAsk = ({ shown, target, noAccess }) => shown === 'locked' && target === 'active' && !!noAccess

/** Это нажатие — кнопка попапа: показан серый locked, запись пошла (target active), а в прошлом рендере панель была в фазе попапа (explain). Повторная попытка прямо на круг (shown ready) сюда не попадает */
export const startsAfterPopup = ({ shown, target, wasPopup }) => shown === 'locked' && target === 'active' && !!wasPopup

/**
 * Сколько мс ещё ждать до показа ready/active (0 — пора, null — ждать возврата в приложение).
 *  ios — iPhone/iPad; readyAt — когда можно показывать (ready появился / микрофон открылся); backAt — когда приложение в последний раз вернулось (0 — не было);
 *  now — текущее время; visible — приложение сейчас видимо (document.visibilityState === 'visible'); delay — пауза после readyAt (по умолчанию READY_DELAY_MS);
 *  notBefore — не раньше этого момента (для активации после попапа: нажатие в попапе + POPUP_DELAY_MS).
 */
export function readyDelayLeft({ ios = false, readyAt, backAt = 0, now, visible = true, delay = READY_DELAY_MS, notBefore = 0 }) {
  let left
  if (!ios) left = Math.max(0, readyAt + delay - now)
  else if (!visible) return null
  else left = Math.max(0, Math.max(readyAt, backAt) + delay - now)
  return Math.max(left, notBefore - now)
}

/**
 * Сколько ждать до показа активации (kind 'active'). Три случая:
 *  — после попапа, системного диалога нет (asked=false): ровно POPUP_DELAY_MS от нажатия (tapAt), возврата в приложение ждать не нужно;
 *  — первый запрос доступа (asked): как раньше — READY_DELAY_MS от «микрофон открылся / приложение вернулось» (readyAt, backAt), но не раньше tapAt + POPUP_DELAY_MS, если нажатие было в попапе;
 *  — прочее: как readyDelayLeft по умолчанию. Остальные поля — как у readyDelayLeft.
 */
export function activationLeft({ asked = false, afterPopup = false, ios = false, tapAt = 0, readyAt, backAt = 0, now, visible = true }) {
  if (afterPopup && !asked) return readyDelayLeft({ ios: false, readyAt: tapAt, now, delay: POPUP_DELAY_MS })
  return readyDelayLeft({ ios, readyAt, backAt, now, visible, notBefore: afterPopup ? tapAt + POPUP_DELAY_MS : 0 })
}
