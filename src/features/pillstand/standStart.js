import { startGameAudio } from '../player/modules/rotate-phone/wordLaneStart.js'
import { restartGameAudio } from '../../shared/lib/gameAudioRestart.js'
import { leaveGameMic } from '../../shared/lib/gameMicLeave.js'
import { endGameAudio } from '../player/modules/rotate-phone/useGameAudioModes.js'

// Запуск и остановка микрофона стенда пилюль ТЕМ ЖЕ ПУТЁМ, что в игре (v3.3.304, владелец: «в стенде старая система захвата микро — то не работает, то в режиме трубки; перенеси систему из игры, она стабильно захватывает»).
// Раньше «Старт» стенда звал голый openGameMic(): без типа аудиосессии (iOS сам выбирал «трубку» — вывод в разговорный динамик), без игрового AudioContext в жесте, без ожидания «аудиосессия улеглась», без слушателей
// фона и возврата. Теперь:
//  • «Старт» — startGameAudio (wordLaneStart.js) с пустым планом: слушатели фона / возврата, тип сессии (play-and-record до getUserMedia, потом playback по настройке «Микрофон игры»), getUserMedia в жесте,
//    игровой AudioContext в жесте, ожидание, пока сессия уляжется; после фона — полное обновление (renewAudioSession), как у «Начать»;
//  • оживление по тапу плашки «Микрофон отключился» — restartGameAudio (как «Продолжить» игры: обновление сессии, проверка вывода, микрофон из жеста);
//  • выход — leaveGameMic (дорожка выключается, через 2 с поток закрывается, сессия сбрасывается) и endGameAudio (тип сессии возвращается), как при выходе из игры.
// Зависимости подставляются в тестах.
export const STAND_CFG = { plan: { game: 'stand' }, chunks: [], confusers: [], translations: [], extraWords: [], hasAudio: false } // пустой план: звука озвучки стенду не нужно, нужен только микрофон и живая аудиосессия

/** «Старт» из тапа (синхронно в обработчике): → промис { mic: 'granted' | 'denied' | 'unavailable', settled, needsTap } (не отклоняется) */
export function startStandMic({ start = startGameAudio } = {}) {
  try {
    return Promise.resolve(start({ cfg: STAND_CFG, audioSrc: null, lines: null, mic: true })).then(r => ({ mic: r?.mic ?? 'unavailable', settled: r?.settled ?? null, needsTap: !!r?.needsTap }), () => ({ mic: 'unavailable', settled: null, needsTap: false }))
  } catch { return Promise.resolve({ mic: 'unavailable', settled: null, needsTap: false }) }
}

/** Оживить микрофон по тапу (синхронно в обработчике): как «Продолжить» игры → промис строки 'granted' | 'denied' | 'unavailable' (для standMicHealth) */
export function restartStandMic({ why = 'стенд: микрофон отключился', restart = restartGameAudio, start = startGameAudio } = {}) {
  try {
    return Promise.resolve(restart({ voice: true, why, start: deps => start({ cfg: STAND_CFG, audioSrc: null, lines: null }, deps) })).then(r => (r?.ok === false && r.mic !== 'granted' ? (r.mic ?? 'unavailable') : 'granted'), () => 'unavailable')
  } catch { return Promise.resolve('unavailable') }
}

/** Выход из стенда: как выход из игры */
export function leaveStandMic({ leave = leaveGameMic, end = endGameAudio } = {}) {
  try { end() } catch { /* тип сессии не вернулся — журнал игры покажет */ }
  try { leave('выход из стенда') } catch { /* поток закроется сам */ }
}
