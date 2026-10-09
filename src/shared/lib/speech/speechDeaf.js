// «Глухая» сессия распознавания (iOS 18, второй запуск подряд): audiostart приходит почти мгновенно (43–57 мс против обычных 450–1400),
// но микрофон на деле ничего не захватывает — ни soundstart, ни speechstart, ни результата. Чистые функции для speechController.js.
import { DEAF_AUDIO_MS, DEAF_WINDOW_MS, DEAF_RETRY_MAX, MAX_ATTEMPTS } from './speechPolicy.js'

export const isFastAudio = ms => typeof ms === 'number' && ms < DEAF_AUDIO_MS

/**
 * Попытка «глухая»: audiostart быстрее DEAF_AUDIO_MS и за всё время не было звука/речи/результата (heard=false).
 * Если попытку остановил сам пользователь («Стоп»), считаем глухой, только когда он слушал не меньше DEAF_WINDOW_MS (иначе просто не успел сказать)
 */
export function isDeaf({ msAudio, heard, listenedMs = 0, userStop = false }) {
  if (!isFastAudio(msAudio) || heard) return false
  return !userStop || listenedMs >= DEAF_WINDOW_MS
}

/**
 * Ставить ли таймер «глухой» (DEAF_WINDOW_MS после audiostart) для этой попытки: прошлая попытка была успешной или сама глухой (hot — аудиосессия уже «горячая»),
 * авто-восстановлений в этом заходе меньше DEAF_RETRY_MAX, повтор возможен
 */
export const wantsDeafTimer = ({ hot, retries = 0, msAudio, retry }) => !!hot && retries < DEAF_RETRY_MAX && isFastAudio(msAudio) && retry + 1 < MAX_ATTEMPTS
