import { useEffect } from 'react'
import { hasGameMic, dropGameMic } from '../../../../shared/lib/gameMic.js'
import { reportAudioLoss } from '../../../../shared/lib/gameAudioSignals.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { gameMicGesture } from '../../../../shared/lib/gameMicGesture.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { gameMicWanted } from '../../../../shared/lib/gameMicWant.js'

// Режимы проверки на iPhone (Админ → «Голос» → «Микрофон игры») на время жизни игры «Повтори за диктором»: тип аудиосессии (gameMicSession, pithy_game_audio_session_v1) и глушение дорожки микрофона
// на время речи Пита и диктора (gameMicHold, pithy_game_mic_hold_v1). Тип сессии ставится уже в тапе «Начать» (RotatePhoneModule); здесь он подтверждается при монтировании (StrictMode, перезапуск) и
// возвращается при размонтировании (вместе с ним — прогрев звука gameAudioWarm). Дорожка не ожила после глушения (iOS глушит её за полсекунды до сворачивания) — поток сбрасывается и игра встаёт на паузу (reportAudioLoss → «Продолжить»); переоткрывать getUserMedia вне жеста нельзя: iOS показывает диалог доступа поверх игры (v3.3.128).

/** Конец игры: все окна речи закрыты (дорожка снова enabled), прежний тип аудиосессии возвращён. Микрофон закрывает вызывающий — после этого */
export function endGameAudio() { gameMicHold.reset(); gameAudioSession.end(); gameAudioWarm.end() }

export function useGameAudioModes(onReopened) {
  useEffect(() => {
    if (gameMicWanted()) gameAudioSession.begin() // «Тапаю» в «Гонке»: микрофона нет — тип сессии записи (play-and-record) не ставим
    gameMicHold.setDeadHandler(why => {
      if (!hasGameMic() || gameMicGesture.needed()) return // после паузы (сворачивание) микрофон открывает только тап «Продолжить»
      pLog(`[mic] дорожка не ожила после глушения (${why}) — пауза; микрофон откроет только тап «Продолжить» (getUserMedia вне жеста показывал диалог доступа, v3.3.128)`)
      dropGameMic(); gameMicGesture.require()
      reportAudioLoss(`mic-dead-${why}`)
    })
    gameMicHold.setReopenHandler(() => { pLog('[mic] режим «микрофон только в фазе ученика»: поток открыт заново, слушатель перезапускается'); onReopened?.() }) // режим 'close': сеанс слушателя жил на закрытых треках
    return () => { gameMicHold.setDeadHandler(null); gameMicHold.setReopenHandler(null); endGameAudio() }
    // onReopened — setState-обёртка родителя: подписка не должна пересоздаваться
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
