import { useState, useEffect, useRef, useCallback } from 'react'
import { startGameAudio } from './wordLaneStart.js'
import { subscribePauseEvents } from './wordLanePauseEvents.js'
import { markGameAudioSuspect, needsRewake } from '../../../../shared/lib/gameAudioLife.js'
import { gameCtxState } from '../../../../shared/lib/gameAudioCtx.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Пауза игры «Повтори за диктором» при сворачивании приложения (iPhone, iOS 18, Safari). Подписка на visibilitychange → hidden и pagehide: игра СРАЗУ встаёт на паузу (f.pause из useWordLaneControls:
// таймеры, голос, слушатель, микрофон, кот, пилюли) и показывает оверлей «Игра на паузе» (WordLanePause). Микрофон после возврата сам НЕ открывается (иначе Safari снова спрашивает доступ вне жеста):
// «Продолжить» — это жест, в нём синхронно открывается микрофон и будится звук (startGameAudio — тот же порядок, что в «Начать» и в перезапуске игры из HUD: тип сессии → микрофон → ждём, пока iOS улёжется →
// будим звук; если приложение уходило в фон — полный путь с новым AudioContext, v3.3.115: пауза помечает звук подозрительным сама), и только после этого ступень идёт сначала (f.restartStage: диктор → очередь ученика). Свернули ещё раз, пока микрофон открывался, — перезапуска нет, остаёмся на паузе.
const MIC_PROBLEM = {
  denied: 'Нет доступа к микрофону. Разреши микрофон для сайта в настройках браузера и нажми «Продолжить» ещё раз.',
  unavailable: 'Микрофон недоступен. Нажми «Продолжить» ещё раз или выйди.',
}

export function useWordLanePause({ f, cfg, audioSrc, lines, dbg = f.dbg, startAudio = startGameAudio }) {
  const [busy, setBusy] = useState(false)    // «Продолжить» открывает микрофон и будит звук (до пары секунд)
  const [problem, setProblem] = useState('') // микрофон не открылся — честное сообщение на оверлее
  const fRef = useRef(f)
  const goneRef = useRef(false)              // приложение снова свёрнуто (или игра закрыта), пока «Продолжить» ещё открывал микрофон
  useEffect(() => { fRef.current = f })

  const episodeRef = useRef(false)           // пауза за этот уход уже поставлена: повторные сигналы (hidden + pagehide + blur + freeze) её не дублируют
  useEffect(() => {
    goneRef.current = false
    const hide = why => {
      goneRef.current = true
      if (episodeRef.current) { pLog(`[pause] сигнал «${why}» — пауза за этот уход уже стоит`); return }
      episodeRef.current = true
      markGameAudioSuspect(`пауза: ${why}`) // «Продолжить» пойдёт полным путём (свежий AudioContext в жесте, wordLaneStart.js), даже если фон-слушатель не успел пометить
      pLog(`[pause] приложение ушло: ${why}; ctx=${gameCtxState() ?? 'нет'} — звук после «Продолжить» поднимется с нуля`)
      if (!fRef.current.pause(why)) episodeRef.current = false // финал / игра уже закончена: пауза не нужна, следующий уход — заново
    }
    const off = subscribePauseEvents(hide)
    return () => { goneRef.current = true; off() }
  }, [])

  /** Тап «Продолжить» (жест): микрофон и звук открываются синхронно в нём, потом ступень сначала */
  const resume = useCallback(() => {
    if (busy || !fRef.current.paused) return
    setBusy(true); setProblem(''); goneRef.current = false; episodeRef.current = false // свернули снова, пока микрофон открывался, — новая пауза
    dbg.event('resume'); pLog(`[pause] «Продолжить»: открываю микрофон из тапа и бужу звук (ctx=${gameCtxState() ?? 'нет'}, пометка звука: ${needsRewake() ?? 'нет'})`)
    let p
    try { p = Promise.resolve(startAudio({ cfg, audioSrc, lines })) } catch (e) { p = Promise.reject(e) } // синхронный префикс startGameAudio — openGameMic прямо в жесте
    p.then(r => r?.mic ?? 'unavailable', () => 'unavailable').then(mic => {
      if (goneRef.current) { setBusy(false); return } // свернули снова (pause уже всё закрыла) или игра закрыта: перезапуска нет
      setBusy(false)
      if (mic === 'granted') { if (fRef.current.paused) fRef.current.restartStage(); return } // игру могли закрыть («Выйти»), пока микрофон открывался
      pLog(`[pause] микрофон не открылся (${mic}) — остаёмся на паузе`)
      fRef.current.pause('mic-' + mic) // закрыть всё, что успел поднять startGameAudio (сессия, прогрев, поток)
      setProblem(MIC_PROBLEM[mic] ?? MIC_PROBLEM.unavailable)
    })
  }, [busy, cfg, audioSrc, lines, dbg, startAudio])

  return { paused: f.paused, pausedIntro: f.pausedIntro, busy, problem, resume }
}
