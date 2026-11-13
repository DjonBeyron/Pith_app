import { closeGameMic, shutGameMic, hasGameMic, isGameMicIdle } from './gameMic.js'
import { stopAllMics } from './micRegistry.js'
import { gameAudioSession } from './gameMicSession.js'

// Выход из игры (v3.3.215). Пауза и конец одной игры оставляют игровой поток живым и выключенным (следующий старт без диалога), но при ВЫХОДЕ из игры индикатор микрофона iOS должен погаснуть:
// владелец видел точку в ленте после выхода. leaveGameMic() — дорожка выключается сразу, а через LEAVE_SHUT_MS (если новая игра за это время не взяла поток) закрывается всё по-настоящему:
// игровой поток (shutGameMic) и любые другие живые дорожки (micRegistry). shutAllMics() — то же без ожидания (закрытие урока).
export const LEAVE_SHUT_MS = 2000
let timer = null

/** Закрыть игровой поток и все остальные живые дорожки микрофона страницы. → сколько посторонних дорожек остановлено */
export function shutAllMics(why = 'выход') {
  if (timer) { clearTimeout(timer); timer = null }
  shutGameMic(why)
  const n = stopAllMics(why)
  try { gameAudioSession.settle?.(why) } catch { /* сессия не мешает закрытию */ } // v3.3.217: после остановки дорожек — тип сессии playback, иначе iOS остаётся в режиме звонка и следующий запуск тихий
  return n
}

/** Экран игры закрыт: дорожка выключается сейчас, через LEAVE_SHUT_MS — полное закрытие (если игру никто не начал заново) */
export function leaveGameMic(why = 'выход из игры', { ms = LEAVE_SHUT_MS } = {}) {
  closeGameMic()
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; if (hasGameMic() && !isGameMicIdle()) return; shutAllMics(why) }, ms) // поток снова в игре — не трогаем
}
