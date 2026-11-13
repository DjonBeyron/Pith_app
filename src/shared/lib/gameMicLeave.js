import { closeGameMic, shutGameMic, hasGameMic, isGameMicIdle } from './gameMic.js'
import { stopAllMics } from './micRegistry.js'
import { gameAudioSession } from './gameMicSession.js'
import { closeAll } from './audioContextRegistry.js'
import { pLog } from './debug.js'

// Выход из игры (v3.3.215). Пауза и конец одной игры оставляют игровой поток живым и выключенным (следующий старт без диалога), но при ВЫХОДЕ из игры индикатор микрофона iOS должен погаснуть:
// владелец видел точку в ленте после выхода. leaveGameMic() — дорожка выключается сразу, а через LEAVE_SHUT_MS (если новая игра за это время не взяла поток) закрывается всё по-настоящему:
// игровой поток (shutGameMic) и любые другие живые дорожки (micRegistry). shutAllMics() — то же без ожидания (закрытие урока).
// v3.3.218: журнал 3.3.217 — в повторной игре эхо Пита в микрофоне в ~4 раза тише (rms 0,0032 против 0,0144 в первой), шум микрофона вдвое ниже: вывод идёт тише, хотя тип сессии 'playback'. gameAudioRenew.js
// описывает причину: WebKit считает аудиосессию активной, пока жив хоть один контекст страницы (в первой игре остаётся контекст звуков интерфейса, созданный при записи). После выхода повторяем рецепт
// обновления: тип 'auto' → закрыть ВСЕ контексты (closeAll) → тип 'playback'. Контексты создаются заново при следующем жесте / старте игры.
export const LEAVE_SHUT_MS = 2000
let timer = null

/** После выхода из игры: сбросить «залипшую» сессию записи. Не трогает начавшуюся заново игру. → { closed, kinds } */
export async function resetAudioAfterGame(why = 'выход из игры', { nav = globalThis.navigator } = {}) {
  if (gameAudioSession.active) return null
  try { if (nav?.audioSession) nav.audioSession.type = 'auto' } catch { /* тип не записался — журнал покажет */ }
  let res = null
  try { res = await closeAll() } catch { /* закрытие не должно ломать выход */ }
  if (gameAudioSession.active) return res // за время ожидания началась новая игра: тип выставит её begin()
  const ok = gameAudioSession.settle?.(why)
  try { pLog(`[audio] после игры (${why}): тип auto, закрыто контекстов ${res?.closed ?? 0}${res?.kinds?.length ? ` (${res.kinds.join(', ')})` : ''}${res?.timedOut ? `, не успели закрыться ${res.timedOut}` : ''}; затем тип playback: ${ok ? 'да' : 'нет'}`) } catch { /* журнал не мешает */ }
  return res
}

/** Закрыть игровой поток и все остальные живые дорожки микрофона страницы, затем сбросить сессию записи. → сколько посторонних дорожек остановлено */
export function shutAllMics(why = 'выход') {
  if (timer) { clearTimeout(timer); timer = null }
  shutGameMic(why)
  const n = stopAllMics(why)
  resetAudioAfterGame(why).catch(() => {}) // тип auto → closeAll → playback (после остановки дорожек)
  return n
}

/** Экран игры закрыт: дорожка выключается сейчас, через LEAVE_SHUT_MS — полное закрытие (если игру никто не начал заново) */
export function leaveGameMic(why = 'выход из игры', { ms = LEAVE_SHUT_MS } = {}) {
  closeGameMic()
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; if (hasGameMic() && !isGameMicIdle()) return; shutAllMics(why) }, ms) // поток снова в игре — не трогаем
}
