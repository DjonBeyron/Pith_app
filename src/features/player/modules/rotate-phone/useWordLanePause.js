import { useState, useEffect, useRef, useCallback } from 'react'
import { startGameAudio } from './wordLaneStart.js'
import { subscribePauseEvents } from './wordLanePauseEvents.js'
import { readTapMode } from './wordLaneHudSettings.js'
import { markGameAudioSuspect, needsRewake, setGameMounted } from '../../../../shared/lib/gameAudioLife.js'
import { gameCtxState } from '../../../../shared/lib/gameAudioCtx.js'
import { subscribeAudioLoss } from '../../../../shared/lib/gameAudioSignals.js'
import { restartGameAudio, SOUND_DEAD_TEXT, TAP_AGAIN_TEXT } from '../../../../shared/lib/gameAudioRestart.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { resumesHere } from './useWordLaneControls.js'

// Пауза игры «Повтори за диктором» при сворачивании приложения (iPhone, iOS 18, Safari). Подписка на visibilitychange → hidden и pagehide: игра СРАЗУ встаёт на паузу (f.pause из useWordLaneControls:
// таймеры, голос, слушатель, микрофон, кот, пилюли) и показывает оверлей «Игра на паузе» (WordLanePause). Микрофон после возврата сам НЕ открывается (иначе Safari снова спрашивает доступ вне жеста):
// «Продолжить» — это жест, в нём синхронно открывается микрофон и будится звук (startGameAudio — тот же порядок, что в «Начать» и в перезапуске игры из HUD: тип сессии → микрофон → ждём, пока iOS улёжется →
// будим звук; если приложение уходило в фон — полный путь с новым AudioContext, v3.3.115: пауза помечает звук подозрительным сама), и только после этого ступень идёт сначала (f.restartStage: диктор → очередь ученика). Свернули ещё раз, пока микрофон открывался, — перезапуска нет, остаёмся на паузе.
// v3.3.121: паузу ставят ещё и потеря звука без ухода страницы (контекст 'interrupted'/'suspended' не по нашей воле, дорожка микрофона mute/ended — gameAudioSignals.js), а «Продолжить» — ЖЁСТКИЙ
// перезапуск (gameAudioRestart.js): все контексты закрываются и создаются заново, в голосе дорожка микрофона выключена на паузе и включается в этом жесте (v3.3.148: поток один на сеанс; после фона
// сначала проверка старой дорожки, getUserMedia — только если она оборвана или не ожила), потом проверка «звук идёт» (running + пробный звук).
// Проверка не прошла — пауза остаётся с «Звук не вернулся, нажми „Продолжить“ ещё раз…» (плюс совет заблокировать/разблокировать экран) вместо тихой игры; жест истёк до микрофона — «Нажми „Продолжить“ ещё раз».
// v3.3.147: пока хук смонтирован, gameAudioLife.gameMounted() = true — уборка после возврата (gameAudioReturnClean.js) не закрывает контексты игры; blur от диалога доступа паузу не ставит (wordLanePauseEvents.js).
const MIC_PROBLEM = {
  denied: 'Нет доступа к микрофону. Разреши микрофон для сайта в настройках браузера и нажми «Продолжить» ещё раз.',
  unavailable: 'Микрофон недоступен. Нажми «Продолжить» ещё раз или выйди.',
}

export function useWordLanePause({ f, cfg, audioSrc, lines, dbg = f.dbg, startAudio = startGameAudio, restart = restartGameAudio, isVoice = () => !readTapMode() }) {
  const [busy, setBusy] = useState(false)    // «Продолжить» открывает микрофон и будит звук (до пары секунд)
  const [problem, setProblem] = useState('') // микрофон не открылся — честное сообщение на оверлее
  const fRef = useRef(f)
  const goneRef = useRef(false)              // приложение снова свёрнуто (или игра закрыта), пока «Продолжить» ещё открывал микрофон
  useEffect(() => { fRef.current = f })

  const episodeRef = useRef(false)           // пауза за этот уход уже поставлена: повторные сигналы (hidden + pagehide + blur + freeze) её не дублируют
  useEffect(() => {
    goneRef.current = false
    setGameMounted(true)
    const hide = why => {
      goneRef.current = true
      if (episodeRef.current) { pLog(`[pause] сигнал «${why}» — пауза за этот уход уже стоит`); return }
      episodeRef.current = true
      markGameAudioSuspect(`пауза: ${why}`) // «Продолжить» пойдёт полным путём (свежий AudioContext в жесте, wordLaneStart.js), даже если фон-слушатель не успел пометить
      pLog(`[pause] приложение ушло: ${why}; ctx=${gameCtxState() ?? 'нет'} — звук после «Продолжить» поднимется с нуля`)
      if (!fRef.current.pause(why)) episodeRef.current = false // финал / игра уже закончена: пауза не нужна, следующий уход — заново
    }
    const off = subscribePauseEvents(hide)
    const offLoss = subscribeAudioLoss(hide) // звук/микрофон потеряны без ухода страницы — та же пауза
    return () => { goneRef.current = true; setGameMounted(false); off(); offLoss() }
  }, [])

  /** Тап «Продолжить» (жест): микрофон и звук открываются синхронно в нём, потом ступень сначала (гонка — с хода паузы, useWordLaneControls.restartStage) */
  const resume = useCallback(() => {
    if (busy || !fRef.current.paused) return
    setBusy(true); setProblem(''); goneRef.current = false; episodeRef.current = false // свернули снова, пока микрофон открывался, — новая пауза
    dbg.event('resume'); pLog(`[pause] «Продолжить»: жёсткий перезапуск звука и микрофона из тапа (ctx=${gameCtxState() ?? 'нет'}, пометка звука: ${needsRewake() ?? 'нет'})`)
    const voice = isVoice()
    let p
    try { p = Promise.resolve(restart({ voice, why: '«Продолжить»', start: deps => startAudio({ cfg, audioSrc, lines }, deps) })) } catch (e) { p = Promise.reject(e) } // синхронный префикс — закрытие контекстов и openGameMic прямо в жесте
    p.catch(() => ({ ok: false, mic: 'unavailable' })).then(r => {
      if (goneRef.current) { setBusy(false); return } // свернули снова (pause уже всё закрыла) или игра закрыта: перезапуска нет
      setBusy(false)
      if (r?.tapAgain) { pLog('[pause] жест истёк до открытия микрофона — жду ещё один тап «Продолжить»'); fRef.current.pause('tap-again'); setProblem(TAP_AGAIN_TEXT); return }
      if (r?.dead) { pLog(`[pause] вывод звука мёртв после всех повторов (${r.failed ?? '—'}) — остаёмся на паузе`); fRef.current.pause('sound-dead'); setProblem(SOUND_DEAD_TEXT); return }
      const mic = r?.mic ?? 'unavailable'
      if (mic !== 'granted' && mic !== 'off') { // 'off' — «Тапаю» в гонке: микрофон не нужен (wordLaneStart.MIC_OFF)
        pLog(`[pause] микрофон не открылся (${mic}) — остаёмся на паузе`)
        fRef.current.pause('mic-' + mic) // закрыть всё, что успел поднять старт звука (сессия, прогрев, поток)
        setProblem(MIC_PROBLEM[mic] ?? MIC_PROBLEM.unavailable)
        return
      }
      if (!r.ok) {
        pLog(`[pause] звук не вернулся (${r.failed ?? '—'}) — остаёмся на паузе, жду ещё один тап`)
        fRef.current.pause('sound-dead')
        setProblem(SOUND_DEAD_TEXT)
        return
      }
      if (fRef.current.paused) fRef.current.restartStage() // игру могли закрыть («Выйти»), пока микрофон открывался
    })
  }, [busy, cfg, audioSrc, lines, dbg, startAudio, restart, isVoice])

  return { paused: f.paused, pausedIntro: f.pausedIntro, pausedHere: resumesHere(f.stages, f), busy, problem, resume } // pausedHere — гонка продолжит с того же слова / фразы
}
