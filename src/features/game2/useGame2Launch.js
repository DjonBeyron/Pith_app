import { useState, useCallback } from 'react'
import { startGameAudio } from '../player/modules/rotate-phone/wordLaneStart.js'
import { prefetchWords } from '../player/modules/rotate-phone/wordLaneFetch.js'
import { stopVoice } from '../player/modules/rotate-phone/wordLaneVoice.js'
import { releaseNotes } from '../player/modules/rotate-phone/wordLaneNotes.js'
import { releaseClips } from '../player/modules/rotate-phone/wordLaneClips.js'
import { endGameAudio } from '../player/modules/rotate-phone/useGameAudioModes.js'
import { stopGameBuffers } from '../../shared/lib/gameBufferPlay.js'
import { closeGameMic } from '../../shared/lib/gameMic.js'
import { gameAudioWarm } from '../../shared/lib/gameAudioWarm.js'
import { gameStartTrace } from '../../shared/lib/gameStartTrace.js'
import { game2Cfg } from './game2Cfg.js'
import { phraseItem } from './game2Phrase.js'
import { log } from './game2Log.js'

// Запуск стенда «Мини-игра 2.0» из тапа «Запустить» (жест!). Порядок — как у «Начать» в игре «Повтори за диктором» (RotatePhoneModule): прямо в тапе, синхронно, — полный экран и startGameAudio (тип аудиосессии →
// микрофон → ждём, пока iOS уляжется → будим звук → ворота: реплики Пита готовы), озвучка фразы докачивается рядом (не дольше PHRASE_WAIT_MS). Микрофон открывается ТОЛЬКО здесь (и в «Продолжить» после паузы).
// phase: wait → (tap: жест истёк, ждём касания) → game; close() — выход: звук, микрофон и полный экран отпущены.
export const PHRASE_WAIT_MS = 8000
const MIC_PROBLEM = {
  denied: 'Нет доступа к микрофону. Разреши микрофон для сайта в настройках браузера и нажми «Запустить» ещё раз.',
  unavailable: 'Микрофон недоступен на этом устройстве, поэтому стенд не запустить.',
}
const leaveFullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen?.() } catch { /* уже вышли */ } }
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))])

export default function useGame2Launch({ lines, phrase, ready = true, start = startGameAudio }) {
  const [phase, setPhase] = useState('wait')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const close = useCallback(() => {
    stopGameBuffers(); stopVoice(); releaseNotes(); releaseClips({ keepWarm: true }); endGameAudio(); closeGameMic(); leaveFullscreen()
    setPhase('wait'); setBusy(false)
  }, [])

  const launch = useCallback(() => {
    if (busy || phase !== 'wait' || !ready || !lines) return
    setBusy(true); setProblem('')
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}) } catch { /* iPhone и часть браузеров не умеют — остаёмся в окне */ }
    const audio = start({ cfg: game2Cfg(), audioSrc: null, lines }) // синхронный префикс — в жесте
    const items = phraseItem(phrase)
    const fetched = items.length ? prefetchWords(items) : Promise.resolve()
    audio.then(async ({ mic, needsTap }) => {
      await race(fetched, PHRASE_WAIT_MS)
      log(`запуск: микрофон ${mic}${needsTap ? ', жест истёк — ждём касание' : ''}, фраза ${phrase?.url ? 'озвучена' : 'не озвучена'}`)
      if (mic !== 'granted') { close(); setProblem(MIC_PROBLEM[mic] ?? MIC_PROBLEM.unavailable); return }
      setPhase(needsTap ? 'tap' : 'game'); setBusy(false)
    }).catch(e => { close(); setProblem(`Не запустилось: ${e?.message ?? e}`) })
  }, [busy, phase, ready, lines, phrase, start, close])

  /** Касание по «Тапни, чтобы начать» (свежий жест): прогрев звука и открытие игры */
  const tapped = useCallback(() => {
    if (gameAudioWarm.status().armed) gameAudioWarm.rewarm('тап по подсказке «Тапни, чтобы начать»', 'click')
    gameStartTrace.setNeedsTap(false); gameStartTrace.mark('hint-tap', { via: 'подсказка' })
    setPhase('game')
  }, [])

  return { phase, busy, problem, launch, tapped, close }
}
