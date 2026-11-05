import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { phraseWords, dueFlags, timingsOf, buildTimeline } from './timelinePlan.js'
import { MODES, HINT_LINE, resumeFrom } from './game2Modes.js'
import { runSession } from './game2Script.js'
import { runLane } from './game2Lane.js'
import { createGame2Listener } from './game2Listen.js'
import { createMicDebug, micState } from './game2MicLog.js'
import { createPhraseVoice } from './game2Voice.js'
import { emptyScore } from './game2Score.js'
import { log } from './game2Log.js'
import { stopGameBuffers } from '../../shared/lib/gameBufferPlay.js'
import { closeGameMic, hasGameMic, dropGameMic, openGameMic } from '../../shared/lib/gameMic.js'
import { gameMicGesture } from '../../shared/lib/gameMicGesture.js'
import { createLevelSource } from '../../shared/lib/speech/sayLevelSource.js'
import { createRmsLevel } from '../../shared/lib/vosk/sayVoskLevel.js'
import { sensitiveLevel } from '../player/modules/rotate-phone/wordLaneConfig.js'
import { endGameAudio, useGameAudioModes } from '../player/modules/rotate-phone/useGameAudioModes.js'

// Директор «Мини-игры 2.0» (этап 1): ведёт сценарий (game2Script.js) и связывает его с экраном. Здесь только проводка React: Пит говорит реплики (useCatLines — тот же кот и тот же звук, что в игре «Повтори за диктором»),
// ленте выдаются пилюли режима (view → Game2Lane), проход ленты — game2Lane.js (часы, голос, слушатель Vosk). Отмена сессии — по токену (выход, пауза, «Ещё раз»): устаревшие ожидания сами выходят.
// Микрофон — тем же путём, что в репетиции: слушатель game2Listen.js (createWordListener + guardStream(getGameMic) + isHeld), режимы звука useGameAudioModes (дорожка, выключенная на речь Пита, после реплики
// возвращается enabled=true, а если не ожила — микрофон переоткрывается и слушатель стартует заново), «оглох» (ровный ноль) — то же, уровень голоса (levels) — для индикатора WordLaneMic; журнал «[game2] mic …».
// Пауза при сворачивании (useWordLanePause.js) работает через adapter: тот же интерфейс { paused, pause, restartStage, dbg }, что у директора игры; «Продолжить» открывает микрофон из тапа и запускает текущий режим сначала.
const sleep = ms => new Promise(r => setTimeout(r, ms))
const frames = n => new Promise(r => { const step = k => (k <= 0 ? r() : requestAnimationFrame(() => step(k - 1))); step(n) })
const SAY_TRIES = 3
const HINT_SHOW_MS = 2500

export default function useGame2Flow({ plan, phrase, catApi, laneApi, cat, listenerRef }) {
  const [modeId, setModeId] = useState('start')
  const [view, setView] = useState({ key: 0, mode: 'start', pills: [], all: [], labels: false, live: false })
  const [score, setScore] = useState(emptyScore)
  const [paused, setPaused] = useState(false)
  const [micNote, setMicNote] = useState('')
  const [micMode, setMicMode] = useState('starting') // индикатор микрофона: starting (открываю) | listening (слушаю)
  const [rms] = useState(() => createRmsLevel({ fromRms: sensitiveLevel })) // громкость голоса (кольца микрофона)
  const [levels] = useState(() => createLevelSource(t => rms.read(t)))
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

  /** Микрофон «не ожил» после глушения / оглох: слушатель текущего прохода стартует заново на переоткрытом потоке (лента идёт дальше) */
  const reopened = useCallback(() => { log('mic: поток переоткрыт — слушатель стартует заново'); activeRef.current?.restart?.() }, [])
  useGameAudioModes(reopened)

  const say = useCallback(async (id, mine) => {
    for (let i = 0; i < SAY_TRIES && token.current === mine; i++) { if (catRef.current.sayLine(id)) break; await sleep(Math.max(150, catRef.current.busyLeft())) }
    await sleep(60)
    while (token.current === mine && catRef.current.busyLeft() > 0) await sleep(Math.min(200, catRef.current.busyLeft()))
    micState(`после реплики ${id}`)
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
    const lane = { setT: t => laneApi.current?.setT(t), mark: (...a) => laneApi.current?.mark(...a), win: (...a) => laneApi.current?.win(...a) }
    const env = {
      cancelled: () => token.current !== mine,
      log,
      say: id => say(id, mine),
      timeline: rate => buildTimeline({ words: i.words, due: i.due, timings: i.timings, durationS: i.durationS, rate }),
      show: async (mode, pills, timeline) => { clearTimeout(hintTimer.current); setHint(''); viewKey.current += 1; setView({ key: viewKey.current, mode: mode.id, pills, all: timeline?.pills ?? pills, labels: mode.labels, live: true }); await frames(2) },
      onMode: id => { modeRef.current = id; setModeId(id); clearTimeout(hintTimer.current); setHint(''); viewKey.current += 1; setView({ key: viewKey.current, mode: id, pills: [], all: [], labels: false, live: false }) }, // новый режим: лента пустая, пока Пит не договорил
      onScore: s => { scoreRef.current = s; setScore(s) },
      onDone: s => { log(`итог: ${JSON.stringify(s)}`) },
      lane: (mode, timeline, pills) => {
        if (globalThis.__g2Expose) globalThis.__g2 = { mode: mode.id, startedAt: performance.now(), pills: pills.map(p => ({ i: p.i, text: p.text, startMs: p.startMs, endMs: p.endMs })) } // стенд без микрофона: поддельный Vosk говорит слова по этим моментам
        return runLane({
          mode, timeline, lane, voice, cancelled: env.cancelled, log, onBegin: () => { if (globalThis.__g2) globalThis.__g2.startedAt = performance.now() }, // стенд: поддельный Vosk «говорит» от момента, когда часы ленты пошли
          makeListener: onHeard => {
            setMicMode('starting')
            const l = createGame2Listener({
              words: i.words, expected: mode.input === 'catch' ? pills.length : i.words.length, maxWords: mode.input === 'catch' ? 2 : null, onHeard, listenerRef, level: rms, onDebug: createMicDebug({ modeId: mode.id, words: i.words }),
              onStatus: st => {
                setMicNote(st === 'unavailable' || st === 'error' ? 'Распознавание речи не запустилось' : '')
                if (st === 'listening' || st === 'starting') setMicMode(st)
                if (st === 'dead') { // ровный ноль дольше 2,5 с: поток заглушён системой — переоткрываем (только если не нужен жест после паузы)
                  if (hasGameMic() && !gameMicGesture.needed()) { log('mic: игровой поток отдаёт тишину — переоткрываю'); dropGameMic(); openGameMic().then(r => { if (r === 'granted') l.restart() }) }
                }
              },
            })
            return (activeRef.current = l)
          },
          onLag: () => { catRef.current.sayLine('rh2_shadow_lag') }, // «Тень» / «Скорость»: отстал больше чем на слово — Пит один раз за проход говорит «ты отстал, догоняй»
          onHint: p => { laneApi.current?.label(p.i); catRef.current.sayLine(HINT_LINE); setHint(p.text); clearTimeout(hintTimer.current); hintTimer.current = setTimeout(() => setHint(''), HINT_SHOW_MS) }, // пилюля первого слова к 3-й секунде уже ушла вниз, поэтому слово ещё и подписью на экране
        })
      },
    }
    log(`сессия: «${i.text}», слов ${i.words.length}, к повтору ${i.due.filter(Boolean).length}${i.estimated ? ', тайминги ОЦЕНКА (фраза не озвучена)' : ', тайминги озвучки'}, старт с «${from}»`)
    return runSession(env, { from, dueCount: i.due.filter(Boolean).length, score: initial })
  }, [stopAll, say, voice, laneApi, listenerRef, rms])

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

  return { modeId, view, score, paused, micNote, micMode, levels, hint, estimated: info.estimated, dueCount, tap, again, adapter, stopAll }
}
