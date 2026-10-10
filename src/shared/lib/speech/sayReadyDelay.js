// Отложенный ПОКАЗ состояний круга-микрофона «Сказать фразу» после серого locked (чистая логика, без React и DOM). ТОЛЬКО ВИЗУАЛЬНАЯ задержка: sayPermission.decide(), флаги, тапы и запись
// работают сразу по настоящему состоянию (micVisualState), а ученик видит «зелёное» (круг, значок, кольцо, волны, подпись) только когда доступ подтверждён — не пока системный диалог ещё на экране.
// Задерживаются ровно два перехода из показанного locked:
//  ready  — «доступ выдан» (locked → ready без нажатия: ответ Permissions API, возврат после прерванной записи); отсчёт от появления ready;
//  active — ПЕРВЫЙ запрос доступа: тап в попапе сразу ставит phase 'run' (запись стартует в жесте), но картинка ждёт, пока микрофон реально открылся (view.status === 'listening', то есть
//           пользователь подтвердил диалог), + READY_DELAY_MS. Только если на момент нажатия доступа не было (noAccess); уже выданный доступ, вводный попап без диалога, повторные попытки — без задержки.
// Всё остальное — сразу: монтирование с выданным доступом (shown стартует равным target), done/off (отказ not-allowed → сразу ветка отказа), отзыв доступа (ready → locked/off).
//  iPhone — отсчёт READY_DELAY_MS от ПОСЛЕДНЕГО из двух событий: «можно показывать» (ready появился / микрофон открылся) и «приложение вернулось» (focus / visibilitychange → visible: диалог iOS
//           закрыт). Пока приложение скрыто — ждём возврата (left = null).
//  Android — возврата в приложение нет: просто отсечка READY_DELAY_MS от «можно показывать».
export const READY_DELAY_MS = 700

/**
 * Какой переход из показанного locked сейчас удерживаем: 'ready' | 'active' | null.
 *  settled — Permissions API уже ответил (sayPermission.isChecked): пока он молчит, ready — «доступ уже был», а не «только что выдали» (монтирование с выданным доступом — без задержки);
 *  asked — запись началась из locked без доступа (startsAsk, запоминается на момент нажатия: после открытия микрофона флаг доступа уже станет true).
 */
export function holdKind({ shown, target, settled = true, asked = false }) {
  if (shown !== 'locked') return null
  if (target === 'ready') return settled ? 'ready' : null
  return target === 'active' && asked ? 'active' : null
}

/** Это нажатие — первый запрос доступа: показан серый locked, запись пошла (target active), доступа на этот момент нет */
export const startsAsk = ({ shown, target, noAccess }) => shown === 'locked' && target === 'active' && !!noAccess

/**
 * Сколько мс ещё ждать до показа ready/active (0 — пора, null — ждать возврата в приложение).
 *  ios — iPhone/iPad; readyAt — когда можно показывать (ready появился / микрофон открылся); backAt — когда приложение в последний раз вернулось (0 — не было);
 *  now — текущее время; visible — приложение сейчас видимо (document.visibilityState === 'visible').
 */
export function readyDelayLeft({ ios = false, readyAt, backAt = 0, now, visible = true }) {
  if (!ios) return Math.max(0, readyAt + READY_DELAY_MS - now)
  if (!visible) return null
  return Math.max(0, Math.max(readyAt, backAt) + READY_DELAY_MS - now)
}
