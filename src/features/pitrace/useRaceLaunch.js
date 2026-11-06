import { useState, useRef, useCallback, useEffect } from 'react'
import { startGameAudio } from '../player/modules/rotate-phone/wordLaneStart.js'
import { pLog } from '../../shared/lib/debug.js'
import useRaceAsk from './useRaceAsk.js'
import { raceStart } from './raceStartTrace.js'
import { raceChron } from './raceStartChron.js'
import { openAsk, answerAsk } from './raceLaunch.js'
import { raceWarm } from './raceWarm.js'
import { micHint } from './raceAskVoice.js'

// Проводка запуска «Встряхни память» в RotatePhoneModule (порядок — raceLaunch.js, CONCEPT_RACE.md «Попап внутри игры»): open — тап «Начать» (сцена с попапом + прогрев без звука, raceWarm.js), pick — «Говорю» / «Тапаю»
// (жест: startGameAudio синхронно; «Говорю» ждёт микрофон в попапе — wait 'mic' / 'sound', отказ — подсказка hint в попапе; «Тапаю» — без микрофона, игра сразу), cancel — крестик попапа (поднятое в жесте отпускается),
// reset — игра кончилась. hold — часы игры стоят, пока звук реплик не готов. Режим тапа на игру (useRaceAsk) возвращается, когда фаза уходит из 'ask' / 'game'. askAuto ('voice' | 'tap') — стенд отвечает на попап сам.
// release — отпустить звук и микрофон, поднятые в жесте (без выхода из полного экрана), leave — выйти из полного экрана, onPlayed — игра действительно началась.
export default function useRaceLaunch({ on, phase, setPhase, cfg, audioSrc, lines, onTap = null, askAuto = null, release, leave, onPlayed = null }) {
  const ask = useRaceAsk({ onTap })
  const [hold, setHold] = useState(false) // сцена открыта, звук ещё готовится — часы игры стоят, Пит уже на экране
  const [wait, setWait] = useState(null)  // «Говорю»: 'mic' — ждём ответ системы о микрофоне, 'sound' — звук улягается после смены аудиосессии
  const [hint, setHint] = useState('')    // микрофон не дали — подсказка в попапе
  const genRef = useRef(0) // номер запуска: ответ startGameAudio старого запуска (попап закрыли, игра кончилась) ничего не меняет

  const open = useCallback(fullscreen => {
    setHint(''); setWait(null)
    raceChron.tap() // хронология «[start]»: отсчёт от этого тапа
    openAsk({ fullscreen, setPhase, prewarm: () => raceWarm.start({ cfg, lines }) }) // жест «Начать»: AudioContext открыт, первые реплики и слова декодируются, пока виден попап
  }, [cfg, lines, setPhase])

  const pick = useCallback(choice => {
    if (phase !== 'ask' || wait) return
    const gen = ++genRef.current
    setHint('')
    answerAsk({
      choice, ask, trace: raceStart, setPhase, setHold, setWait, current: () => genRef.current === gen, startAudio: hooks => startGameAudio({ cfg, audioSrc, lines, ...hooks }),
      onEnter: () => raceWarm.entryReport(),
      onDenied: ({ mic } = {}) => { pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic} — остаёмся в попапе`); release(); setHint(micHint(mic)) },
      onAudio: ({ mic, needsTap }) => {
        pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic}`)
        onPlayed?.(); setHold(false)
        if (needsTap) setPhase('tap') // жест истёк до прогрева, а контекст не запущен: сначала касание, потом игра
      },
    })
  }, [phase, wait, ask, cfg, audioSrc, lines, setPhase, release, onPlayed])

  const cancel = useCallback(() => {
    genRef.current += 1; raceStart.cancel(); raceChron.cancel(); setWait(null); setHint('')
    release() // «Говорю» мог уже открыть микрофон и сессию записи
    setPhase('wait'); leave()
  }, [release, leave, setPhase])

  const reset = useCallback(() => { genRef.current += 1; setHold(false); setWait(null); raceStart.cancel() }, [])

  useEffect(() => { // стенд: ?ask=voice|tap — попап проходится сам
    if (phase !== 'ask' || !askAuto || hint) return undefined
    const t = setTimeout(() => pick(askAuto), 0)
    return () => clearTimeout(t)
  }, [phase, askAuto, hint, pick])
  useEffect(() => { // хронология: сцена игры смонтирована (эффект родителя идёт после эффектов WordLaneGame) и её первый кадр
    if (!on || phase !== 'game' || !raceChron.active()) return undefined
    raceChron.step('mount', 'сцена игры смонтирована')
    const id = requestAnimationFrame(() => raceChron.step('frame', 'первый кадр сцены'))
    return () => cancelAnimationFrame(id)
  }, [on, phase])
  const { watch } = ask
  useEffect(() => { if (on) watch({ phase: phase === 'tap' ? 'game' : phase }) }, [on, phase, watch]) // попап закрыт, игра кончилась — прежний режим тапа возвращается

  return { hold, open, reset, plate: { choice: ask.choice, wait, hint, onPick: pick, onCancel: cancel } }
}
