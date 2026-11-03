import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { phraseWords, dueFlags, timingsOf, buildTimeline } from './timelinePlan.js'
import { MODES, HINT_LINE, resumeFrom } from './game2Modes.js'
import { runSession } from './game2Script.js'
import { runLane } from './game2Lane.js'
import { createGame2Listener } from './game2Listen.js'
import { createPhraseVoice } from './game2Voice.js'
import { emptyScore } from './game2Score.js'
import { log } from './game2Log.js'
import { stopGameBuffers } from '../../shared/lib/gameBufferPlay.js'
import { closeGameMic } from '../../shared/lib/gameMic.js'
import { gameMicGesture } from '../../shared/lib/gameMicGesture.js'
import { endGameAudio } from '../player/modules/rotate-phone/useGameAudioModes.js'

// Директор «Мини-игры 2.0» (этап 1): ведёт сценарий (game2Script.js) и связывает его с экраном. Здесь только проводка React: Пит говорит реплики (useCatLines — тот же кот и тот же звук, что в игре «Повтори за диктором»),
// ленте выдаются пилюли режима (view → Game2Lane), проход ленты — game2Lane.js (часы, голос, слушатель Vosk). Отмена сессии — по токену (выход, пауза, «Ещё раз»): устаревшие ожидания сами выходят.
// Пауза при сворачивании (useWordLanePause.js) работает через adapter: тот же интерфейс { paused, pause, restartStage, dbg }, что у директора игры; «Продолжить» открывает микрофон из тапа и запускает текущий режим сначала.
const sleep = ms => new Promise(r => setTimeout(r, ms))
const frames = n => new Promise(r => { const step = k => (k <= 0 ? r() : requestAnimationFrame(() => step(k - 1))); step(n) })
const SAY_TRIES = 3
const HINT_SHOW_MS = 2500

export default function useGame2Flow({ plan, phrase, catApi, laneApi, cat, listenerRef }) {
  const [modeId, setModeId] = useState('start')
  const [view, setView] = useState({ key: 0, mode: 'start', pills: [], labels: false })
  const [score, setScore] = useState(emptyScore)
  const [paused, setPaused] = useState(false)
  const [micNote, setMicNote] = useState('')
  const [hint, setHint] = useState('') // подсказка «По памяти»: слово, с которого начать (подпись на экране, пока звучит «Начни с»)
  const hintTimer = useRef(0)
  const token = useRef(0)
  const catRef = useRef(cat)
  const modeRef = useRef('start')
  const scoreRef = useRef(score)
  const activeRef = useRef(null) // слушатель текущего прохода (тап по пилюле)
  const viewKey = useRef(0)
  useEffect(() => { catRef.current = cat })

  const info = useMemo(() => {
    const words = phraseWords(plan)
    const t = timingsOf(words, phrase)
    return { words, due: dueFlags(words, plan), ...t, text: words.join(' ') }
  }, [plan, phrase])
  const infoRef = useRef(info)
  useEffect(() => { infoRef.current = info })
  const dueCount = info.due.filter(Boolean).length
  const voice = useMemo(() => createPhraseVoice({ phrase, text: info.text, catApi, log }), [phrase, info.text, catApi])

  const say = useCallback(async (id, mine) => {
    for (let i = 0; i < SAY_TRIES && token.current === mine; i++) { if (catRef.current.sayLine(id)) break; await sleep(Math.max(150, catRef.current.busyLeft())) }
    await sleep(60)
    while (token.current === mine && catRef.current.busyLeft() > 0) await sleep(Math.min(200, catRef.current.busyLeft()))
  }, [])

  const stopAll = useCallback(() => {
    token.current += 1
    try { voice.stop() } catch { /* уже тихо */ }
    try { activeRef.current?.dispose() } catch { /* уже свободен */ }
    activeRef.current = null
    catRef.current.stop()
    clearTimeout(hintTimer.current)
  }, [voice])

  const start = useCallback((from, initial = emptyScore()) => {
    stopAll()
    const mine = token.current
    const i = infoRef.current
    const lane = { setT: t => laneApi.current?.setT(t), mark: (...a) => laneApi.current?.mark(...a) }
    const env = {
      cancelled: () => token.current !== mine,
      log,
      say: id => say(id, mine),
      timeline: rate => buildTimeline({ words: i.words, due: i.due, timings: i.timings, durationS: i.durationS, rate }),
      show: async (mode, pills) => { clearTimeout(hintTimer.current); setHint(''); viewKey.current += 1; setView({ key: viewKey.current, mode: mode.id, pills, labels: mode.labels }); await frames(2) },
      onMode: id => { modeRef.current = id; setModeId(id); clearTimeout(hintTimer.current); setHint('') },
      onScore: s => { scoreRef.current = s; setScore(s) },
      onDone: s => { log(`итог: ${JSON.stringify(s)}`) },
      lane: (mode, timeline, pills) => {
        if (globalThis.__g2Expose) globalThis.__g2 = { mode: mode.id, startedAt: performance.now(), pills: pills.map(p => ({ i: p.i, text: p.text, startMs: p.startMs, endMs: p.endMs })) } // стенд без микрофона: поддельный Vosk говорит слова по этим моментам
        return runLane({
          mode, timeline, lane, voice, cancelled: env.cancelled, log,
          makeListener: onHeard => (activeRef.current = createGame2Listener({ words: i.words, expected: mode.input === 'catch' ? pills.length : i.words.length, onHeard, listenerRef, onStatus: s => setMicNote(s === 'unavailable' || s === 'error' ? 'Распознавание речи не запустилось' : '') })),
          onHint: p => { laneApi.current?.label(p.i); catRef.current.sayLine(HINT_LINE); setHint(p.text); clearTimeout(hintTimer.current); hintTimer.current = setTimeout(() => setHint(''), HINT_SHOW_MS) }, // пилюля первого слова к 3-й секунде уже ушла вниз, поэтому слово ещё и подписью на экране
        }).finally(() => { activeRef.current = null })
      },
    }
    log(`сессия: «${i.text}», слов ${i.words.length}, к повтору ${i.due.filter(Boolean).length}${i.estimated ? ', тайминги ОЦЕНКА (фраза не озвучена)' : ', тайминги озвучки'}, старт с «${from}»`)
    return runSession(env, { from, dueCount: i.due.filter(Boolean).length, score: initial })
  }, [stopAll, say, voice, laneApi, listenerRef])

  useEffect(() => { start('start'); return () => { stopAll() } }, [start, stopAll])

  /** Тап по пилюле («тап вместо речи»): слово пилюли считается сказанным сейчас */
  const tap = useCallback(i => { activeRef.current?.tap(i) }, [])
  const again = useCallback(() => { setScore(emptyScore()); scoreRef.current = emptyScore(); setPaused(false); start('start') }, [start])

  /** Пауза при сворачивании: всё замолкает, микрофон закрыт и открывается только тапом «Продолжить» */
  const pause = useCallback(why => {
    if (modeRef.current === 'done') return false
    stopAll(); stopGameBuffers(); catApi.current?.freeze?.(); endGameAudio(); closeGameMic(); gameMicGesture.require()
    log(`пауза (${why}): режим «${MODES[modeRef.current]?.title}»`)
    setPaused(true)
    return true
  }, [stopAll, catApi])
  const restartStage = useCallback(() => { setPaused(false); start(resumeFrom(modeRef.current), scoreRef.current) }, [start])
  const adapter = useMemo(() => ({ paused, pausedIntro: false, pause, restartStage, dbg: { event() {} } }), [paused, pause, restartStage])

  return { modeId, view, score, paused, micNote, hint, estimated: info.estimated, dueCount, tap, again, adapter, stopAll }
}
