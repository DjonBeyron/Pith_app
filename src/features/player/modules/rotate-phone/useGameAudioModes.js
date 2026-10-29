import { useEffect } from 'react'
import { hasGameMic, dropGameMic, openGameMic } from '../../../../shared/lib/gameMic.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Режимы проверки на iPhone (Админ → «Голос» → «Микрофон игры») на время жизни игры «Повтори за диктором»: тип аудиосессии (gameMicSession, pithy_game_audio_session_v1) и глушение дорожки микрофона
// на время речи Пита и диктора (gameMicHold, pithy_game_mic_hold_v1). Тип сессии ставится уже в тапе «Начать» (RotatePhoneModule); здесь он подтверждается при монтировании (StrictMode, перезапуск) и
// возвращается при размонтировании. Дорожка не ожила после глушения — тот же путь, что у «оглохшего» микрофона: поток сбрасывается и открывается заново, слушатель пересоздаётся (onReopened).

/** Конец игры: все окна речи закрыты (дорожка снова enabled), прежний тип аудиосессии возвращён. Микрофон закрывает вызывающий — после этого */
export function endGameAudio() { gameMicHold.reset(); gameAudioSession.end() }

export function useGameAudioModes(onReopened) {
  useEffect(() => {
    gameAudioSession.begin()
    gameMicHold.setDeadHandler(why => {
      if (!hasGameMic()) return
      pLog(`[mic] дорожка не ожила после глушения (${why}) — переоткрываю`)
      dropGameMic()
      openGameMic().then(r => { if (r === 'granted') onReopened?.() })
    })
    return () => { gameMicHold.setDeadHandler(null); endGameAudio() }
    // onReopened — setState-обёртка родителя: подписка не должна пересоздаваться
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
