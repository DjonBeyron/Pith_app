// «Вкладка «Голос» реально на экране?» — решает, держать ли полную тишину приложения (useTabSilence → soundQuiet.holdSilence).
// Почему не одним IntersectionObserver: скрытые вкладки оболочки лежат стопкой с `visibility: hidden` (.shellV2TabHidden, shell-v2.css) и по геометрии
// остаются «видимыми» — IntersectionObserver про visibility не знает и класс не отслеживает. Админка смонтирована всегда, последняя субвкладка запоминается
// (AdminV2, localStorage), поэтому после одного захода в «Голос» тишина держалась на ВСЁ приложение, включая чаты уроков — звуки интерфейса «пропали».
// Чистая функция: el — корень вкладки (нужен только closest), intersecting — последний ответ IntersectionObserver (null — наблюдателя нет), lessonOpen — открыт плеер урока.
export const HIDDEN_TAB_SELECTOR = '.shellV2TabHidden'
export const TAB_SELECTOR = '.shellV2Tab'

export function tabShown({ el, intersecting = true, lessonOpen = false }) {
  if (lessonOpen) return false // урок поверх: его звуки молчать не должны, записи в пробе в этот момент нет
  if (intersecting === false) return false
  try { if (el?.closest?.(HIDDEN_TAB_SELECTOR)) return false } catch { /* нет DOM — решает наблюдатель */ }
  return true
}
