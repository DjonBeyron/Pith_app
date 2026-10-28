import { WARM_MAX_MS } from './preloadWarm.js'

// Сколько держать точки «печатает» перед не прогретой нодой (useGraphPlayer.tryReveal). Раньше — ровно WARM_MAX_MS (4 с) и дальше
// показ «как есть»: на медленной сети фото выходило в чат пустым кадром, картинка доезжала потом (стенд: 8 КБ/с, пустой кадр на 7,8 с).
// Теперь: после WARM_MAX_MS ждём ещё, ПОКА ФАЙЛ РЕАЛЬНО КАЧАЕТСЯ (байты приходили не позже WARM_STALL_MS назад), но не дольше
// WARM_HARD_MS от начала ожидания. Загрузка встала/ошибка/файла в очереди нет — отпускаем, как раньше (запасные пути модулей)
export const WARM_HARD_MS = 15000
export const WARM_STALL_MS = 3000

// warm — нода прогрета; now — сейчас; deadline — конец обычного ожидания (старт + WARM_MAX_MS);
// lastProgressAt — когда в последний раз приходили байты файлов ноды (null — ничего не качается)
export function keepWaiting({ warm, now, deadline, lastProgressAt }) {
  if (warm) return false
  if (now < deadline) return true
  const hardDeadline = deadline - WARM_MAX_MS + WARM_HARD_MS
  return now < hardDeadline && lastProgressAt != null && now - lastProgressAt < WARM_STALL_MS
}
