// Админский эксперимент модуля «Сказать фразу»: на время записи ставить navigator.audioSession.type = 'play-and-record' и возвращать 'auto' после
// (speechAudioSession.js; гипотеза — звуки страницы переключают аудиосессию iOS, и распознавание получает «глухой» захват). Флаг localStorage
// `pithy_say_audiosession_v1` ('0' = выкл), ПО УМОЛЧАНИЮ ВКЛЮЧЁН (после тестов пользователя на iPhone: S6 с play-and-record снял «глухие» повторные запуски); админ может выключить в Админ → «Голос». Побочный эффект
// play-and-record — вывод звука на ресивер, поэтому тип держится только на время записи. Пометка «аудиосессия: play-and-record» — в серой плашке админа над панелью.
import { SESSION_PLAY_REC } from './speechAudioSession.js'

export const SAY_AUDIOSESSION_KEY = 'pithy_say_audiosession_v1'

export function isSayAudioSessionOn(store = globalThis.localStorage) {
  try { return store?.getItem(SAY_AUDIOSESSION_KEY) !== '0' } catch { return true }
}
export function setSayAudioSessionOn(on, store = globalThis.localStorage) {
  try { if (on) store?.removeItem(SAY_AUDIOSESSION_KEY); else store?.setItem(SAY_AUDIOSESSION_KEY, '0') } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Тип сессии для контроллера модуля на момент тапа: включено (по умолчанию) → 'play-and-record', выключено админом → null (контроллер ничего не ставит) */
export const sayAudioSessionType = store => (isSayAudioSessionOn(store) ? SESSION_PLAY_REC : null)
