// Админский эксперимент модуля «Сказать фразу»: на время записи ставить navigator.audioSession.type = 'play-and-record' и возвращать 'auto' после
// (speechAudioSession.js; гипотеза — звуки страницы переключают аудиосессию iOS, и распознавание получает «глухой» захват). Флаг localStorage
// `pithy_say_audiosession_v1` ('1' = вкл), ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН; у обычных учеников всегда выкл. Включается в Админ → «Голос». Побочный эффект
// play-and-record — вывод звука на ресивер, поэтому тип держится только на время записи. Пометка «аудиосессия: play-and-record» — в серой плашке админа над панелью.
import { SESSION_PLAY_REC } from './speechAudioSession.js'

export const SAY_AUDIOSESSION_KEY = 'pithy_say_audiosession_v1'

export function isSayAudioSessionOn(store = globalThis.localStorage) {
  try { return store?.getItem(SAY_AUDIOSESSION_KEY) === '1' } catch { return false }
}
export function setSayAudioSessionOn(on, store = globalThis.localStorage) {
  try { if (on) store?.setItem(SAY_AUDIOSESSION_KEY, '1'); else store?.removeItem(SAY_AUDIOSESSION_KEY) } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Тип сессии для контроллера модуля на момент тапа: флаг вкл → 'play-and-record', иначе null (контроллер ничего не ставит) */
export const sayAudioSessionType = store => (isSayAudioSessionOn(store) ? SESSION_PLAY_REC : null)
