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
// обновления: тип 'auto' → закрыть ВСЕ контексты (closeAll). v3.3.219: тип остаётся 'auto' (журнал 3.3.218: с 'playback' после выхода повторная игра всё равно тихая; 'auto' + без дорожек + без контекстов = состояние страницы перед ПЕРВОЙ игрой, где звук нормальный). Контексты создаются заново при следующем жесте / старте игры.
export const LEAVE_SHUT_MS = 2000
let timer = null

/** После выхода из игры: сбросить «залипшую» сессию записи. Не трогает начавшуюся заново игру. → { closed, kinds } */
const nowMs = () => globalThis.performance?.now?.() ?? Date.now()
// v3.3.223 (журнал 3.3.222: тап «Начать» новой игры пришёлся на 2-секундное окно после выхода — сброс закрыл свежий игровой контекст, «Голосом» пересоздавал его, а слова декодировались заново 4,9 с): контексты, созданные
// ПОСЛЕ выхода (since — момент выхода), сброс не трогает.
export async function resetAudioAfterGame(why = 'выход из игры', { nav = globalThis.navigator, since = null } = {}) {
  if (gameAudioSession.active) return null
  try { if (nav?.audioSession) nav.audioSession.type = 'auto' } catch { /* тип не записался — журнал покажет */ }
  let res = null
  try { res = await closeAll(since == null ? {} : { except: r => r.createdAt >= since }) } catch { /* закрытие не должно ломать выход */ }
  if (gameAudioSession.active) return res // за время ожидания началась новая игра: тип выставит её begin()
  try { pLog(`[audio] после игры (${why}): тип auto, закрыто контекстов ${res?.closed ?? 0}${res?.kinds?.length ? ` (${res.kinds.join(', ')})` : ''}${res?.timedOut ? `, не успели закрыться ${res.timedOut}` : ''}; тип оставлен auto — как у только что загруженной страницы`) } catch { /* журнал не мешает */ }
  return res
}

/** Закрыть игровой поток и все остальные живые дорожки микрофона страницы, затем сбросить сессию записи. → сколько посторонних дорожек остановлено */
export function shutAllMics(why = 'выход', { since = null } = {}) {
  if (timer) { clearTimeout(timer); timer = null }
  shutGameMic(why)
  const n = stopAllMics(why)
  resetAudioAfterGame(why, { since }).catch(() => {}) // тип auto → closeAll → playback (после остановки дорожек)
  return n
}

/** Экран игры закрыт: дорожка выключается сейчас, через LEAVE_SHUT_MS — полное закрытие (если игру никто не начал заново) */
export function leaveGameMic(why = 'выход из игры', { ms = LEAVE_SHUT_MS } = {}) {
  closeGameMic()
  const leftAt = nowMs()
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { // v3.3.219: раньше пропускали, если поток «не выключен» (idle=false) — после второго выхода что-то успевало снова взять поток (getGameMic / открытие, начатое до выхода), и точка микрофона висела до конца сессии. Теперь пропускаем только начавшуюся заново игру (gameAudioSession.active ставит begin() в тапе «Начать»)
    timer = null
    if (gameAudioSession.active) { try { pLog('[mic] выход: идёт новая игра — поток не закрываем') } catch { /* журнал не мешает */ } return }
    try { pLog(`[mic] выход из игры: закрываем микрофон (поток ${hasGameMic() ? (isGameMicIdle() ? 'выключен' : 'ВКЛЮЧЁН — кто-то взял его после выхода') : 'уже закрыт'})`) } catch { /* журнал не мешает */ }
    shutAllMics(why, { since: leftAt })
  }, ms)
}
