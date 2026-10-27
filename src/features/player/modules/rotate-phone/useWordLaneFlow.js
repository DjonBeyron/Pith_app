import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { createRmsLevel } from '../../../../shared/lib/vosk/sayVoskLevel.js'
import { createWordListener } from './wordLaneListen.js'
import { speakWord, playTrack, stopVoice } from './wordLaneVoice.js'
import { playNote, releaseNotes } from './wordLaneNotes.js'
import { buildStages, listenStepOf, labelsFor } from './wordLaneStages.js'
import { stepTargets, textOf } from './wordLaneRecipe.js'
import { clipsFor, playSpan, estChunkMs } from './wordLaneAudio.js'
import { playClip, playWordSlot, releaseClips } from './wordLaneClips.js'
import { makeLib, libRow } from './wordLaneLib.js'
import { useCatLines } from './useCatLines.js'
import { DROP_MS, LANES_MS } from './wordLaneTimeline.js'
import { XP_PER_PILL, sensitiveLevel } from './wordLaneConfig.js'
import { getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { getGameMic, closeGameMic, hasGameMic, dropGameMic, openGameMic } from '../../../../shared/lib/gameMic.js'

// Сценарий игры «Повтори за диктором» — директор. Рецепт (wordLaneRecipe) разложен на стадии (wordLaneStages); директор проходит их по порядку, у каждой стадии свои таймеры, и смена стадии их чистит.
// ВСЕ таймеры стадии считаются от одной точки — s.at (её же берёт движок пилюль), иначе голос и картинка расходились бы:
//  drop → lanes      слово/фраза падает сверху, проявляются три дорожки;
//  announce          плашка раунда;
//  dictor            диктор проговаривает повторы ступени: звук каждого повтора включается по плану (клип из общего файла или голос системы), пилюли заливаются в такт речи;
//  turn              плашка «Теперь твоя очередь»; слушатель Vosk стартует уже под ней (тяжёлый запуск не мешает ходу пилюль);
//  student           повторы выкатываются сами, ученик успевает их сказать — распознавание (wordLaneListen) принимает цели, движок (useWordLanePills) решает судьбу пилюль;
//  order             раунд «Порядок»: подсказка диктора — ученик тапает дорожки (wordLaneOrder);
//  reveal            фраза и перевод; «Дальше» отпускает ноду.
// Микрофон включается сам (доступ дан заранее, в карточке/запуске урока). Нет модели Vosk или микрофон не открылся — ручной режим: тап по микрофону = «сказал».
const EXIT_PAUSE_MS = 1300   // ступень закончена: заливка доходит до конца, щелчок, нота — и только потом дальше
const AUDIO_LATENCY_MS = 70  // звук включаем чуть раньше плана: запуск элемента и перемотка занимают время
const HINT_MS = 3500         // подпись дорожки, которую показали после «не успел» в раунде «вслепую»

const REVEAL_LINE_MS = 700   // «Отлично!» — чуть позже появления перевода
const LINE_AT_MS = 250       // реплика кота на плашке раунда — чуть позже появления плашки

const IDLE = { kind: 'idle' }

export function useWordLaneFlow({ chunks, translation, lang, clips = null, audioSrc = null, audio = null, catApi = null, lines = null, onFinished }) {
  const [rate] = useState(getVoiceRate) // скорость голоса урока: на неё растянут план диктора
  const [lib] = useState(() => makeLib(chunks)) // озвучка кусков в библиотеке слов на момент старта игры (длины и наличие)
  const built = useMemo(() => buildStages({ chunks, clips, audio, rate, lib }), [chunks, clips, audio, rate, lib])
  const { stages, chunkMs, chunkCurves, lanes, clipMode } = built
  useEffect(() => { pLog(`[word-lane] диктор: ${audioSrc ? (clips ? 'озвучка автора, клипы найдены' : 'озвучка есть, но клипы кусков не найдены — куски проговорит голос системы') : 'без озвучки — голос системы'}`) }, [audioSrc, clips])
  const [micEpoch, setMicEpoch] = useState(0) // растёт, когда микрофон переоткрыт: слушатель пересоздаётся на новом потоке
  const [s, setS] = useState({ stage: 'drop', idx: 0, at: 0, xp: 0, xpEvents: [], note: '', lid: '', seq: [], misses: 0, mic: 'starting', hint: [] })
  const sRef = useRef(s)
  const listenerRef = useRef(null)
  const finishedRef = useRef(false)
  const sceneApi = useRef(null)          // движок отвечает: order — tap(lane); student — nextTarget()
  const signalRef = useRef({ tail: null, heardAt: 0 }) // что слышит распознаватель прямо сейчас (недосказанная цель, когда последний раз что-то услышал) — без перерисовок React
  const timersRef = useRef(new Set())
  const xpIdRef = useRef(0)
  const noteTimerRef = useRef(0)
  const hintTimerRef = useRef(0)
  const [rms] = useState(() => createRmsLevel({ fromRms: sensitiveLevel })) // громкость голоса ученика (кольца микрофона, ворота)
  const [levels] = useState(() => createLevelSource(t => rms.read(t)))
  useEffect(() => { sRef.current = s })
  const cat = useCatLines({ lines, rate, catApi, listenerRef }) // реплики кота: подпись + озвучка + рот по буквам
  const sayLineRef = useRef(cat.sayLine)
  useEffect(() => { sayLineRef.current = cat.sayLine })
  const sayLine = (...a) => sayLineRef.current(...a) // обработчики и таймеры стадий всегда берут свежую версию (настройки реплик могут догрузиться) — а стадия из-за этого не перезапускается

  const later = useCallback((fn, ms) => { const id = setTimeout(() => { timersRef.current.delete(id); fn() }, Math.max(0, ms)); timersRef.current.add(id); return id }, [])
  const clearTimers = useCallback(() => { timersRef.current.forEach(clearTimeout); timersRef.current.clear() }, [])
  const go = useCallback((stage, idx = 0) => setS(p => ({ ...p, stage, idx, at: performance.now(), hint: [] })), [])
  const next = useCallback(() => { const i = sRef.current.idx + 1; if (i >= stages.length) go('reveal', i); else go('run', i) }, [go, stages.length])
  const stageObj = s.stage === 'run' ? stages[s.idx] : null

  // Звук куска: слот библиотеки слов (подготовлен в тапе «Начать») → озвучка библиотеки обычным путём → голос системы
  const sayChunk = useCallback(i => {
    const r = libRow(chunks[i])
    if (r && playWordSlot(r.key)) return
    speakWord(chunks[i], lang)
  }, [chunks, lang])
  // Звук записи автора (клип фразы целиком): клип в памяти → перемотка файла
  const sayClip = useCallback(row => { const span = playSpan(row); if (!playClip(span)) playTrack(audioSrc, span) }, [audioSrc])
  // Озвучить высказывание из кусков parts сразу (подсказки раунда «Порядок»): запись автора — только у целой фразы, иначе куски по отдельности один за другим
  const say = useCallback((parts, repIdx = 0) => {
    const row = audioSrc && clipMode(parts) ? clipsFor(clips, chunks.length, parts, repIdx) : null
    if (row) { sayClip(row); return }
    let at = 0
    parts.forEach(i => { const ms = (lib(i)?.ms ?? estChunkMs(chunks[i])) / (rate > 0 ? rate : 1); later(() => sayChunk(i), Math.max(0, at - (lib(i)?.lead ?? 0) / (rate > 0 ? rate : 1))); at += ms + 80 })
  }, [audioSrc, clips, chunks, clipMode, lib, rate, later, sayChunk, sayClip])

  const flash = useCallback(text => { clearTimeout(noteTimerRef.current); setS(p => ({ ...p, note: text })); noteTimerRef.current = setTimeout(() => setS(p => ({ ...p, note: '' })), 2600) }, [])

  // Реакции игры (зовёт движок пилюль, useWordLanePills). Обработчики свежие на каждый рендер (handlers), а fx — стабильный объект-обёртка: движку не нужно перезапускаться
  const handlers = {
    win(order, rect) {
      if (playNote(order)) listenerRef.current?.mute(900)
      catApi?.current?.react('love', 1600)
      catApi?.current?.peek?.()
      const id = ++xpIdRef.current
      setS(p => ({ ...p, xpEvents: [...p.xpEvents, { id, amount: XP_PER_PILL, rect }] }))
    },
    miss() { catApi?.current?.react('shy', 1300) },
    fail(e) {
      catApi?.current?.react('shy', 1300)
      const st = stages[sRef.current.idx]
      const said = e.order ? false : sayLine(st?.step?.reps?.[0]?.parts?.length > 1 ? 'split_words' : 'try_again') // не получилось сказать несколько кусков — кот советует говорить раздельно
      if (!said) flash(e.order ? 'Не успел — тапай дорожки, пока пилюли на экране' : 'Не успел — говори, пока пилюли на экране')
      if (!e.order && st?.step && !st.step.labels.length) { // вслепую: после «не успел» показываем, что это за кусок
        setS(p => ({ ...p, hint: e.rep.parts }))
        clearTimeout(hintTimerRef.current)
        hintTimerRef.current = setTimeout(() => setS(p => ({ ...p, hint: [] })), HINT_MS)
      }
    },
    mouth(level, code) { catApi?.current?.mouth(level, code) },
    peek(ms) { catApi?.current?.peek?.(ms) },
    say(parts) { // подсказка раунда «Порядок»: кот выскакивает, диктор называет куски
      catApi?.current?.peek?.(parts.reduce((sum, i) => sum + (lib(i)?.ms ?? estChunkMs(chunks[i])) / (rate > 0 ? rate : 1) + 80, 700))
      say(parts)
    },
    finished() { const at = sRef.current.idx; later(() => { if (sRef.current.idx === at && sRef.current.stage === 'run') next() }, EXIT_PAUSE_MS) },
  }
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers })
  const [fx] = useState(() => ({
    win: (...a) => handlersRef.current.win(...a), miss: (...a) => handlersRef.current.miss(...a), fail: (...a) => handlersRef.current.fail(...a),
    mouth: (...a) => handlersRef.current.mouth(...a), peek: (...a) => handlersRef.current.peek(...a), say: (...a) => handlersRef.current.say(...a), finished: (...a) => handlersRef.current.finished(...a),
  }))

  const dismissXp = useCallback(id => setS(p => {
    const ev = p.xpEvents.find(e => e.id === id)
    return ev ? { ...p, xp: p.xp + ev.amount, xpEvents: p.xpEvents.filter(e => e.id !== id) } : p
  }), [])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    stopVoice(); releaseNotes(); releaseClips(); clearTimers(); closeGameMic()
    listenerRef.current?.dispose()
    onFinished?.()
  }, [onFinished, clearTimers])

  useEffect(() => () => { closeGameMic(); stopVoice(); releaseNotes(); releaseClips(); clearTimeout(noteTimerRef.current); clearTimeout(hintTimerRef.current); timersRef.current.forEach(clearTimeout); listenerRef.current?.dispose() }, [])

  // Вступление
  useEffect(() => {
    if (s.stage === 'drop') { const t = setTimeout(() => go('lanes'), DROP_MS); return () => clearTimeout(t) }
    if (s.stage === 'lanes') { const t = setTimeout(() => go('run', 0), LANES_MS); return () => clearTimeout(t) }
    return undefined
  }, [s.stage, go])

  // Финал: кот хвалит, пока на экране перевод
  useEffect(() => {
    if (s.stage !== 'reveal') return undefined
    const t = setTimeout(() => sayLine('well_done'), REVEAL_LINE_MS)
    return () => clearTimeout(t)
  }, [s.stage])

  // Стадии: свои таймеры, смена стадии их чистит
  useEffect(() => {
    if (s.stage !== 'run' || !stageObj) return undefined
    const left = at => Math.max(0, at - (performance.now() - s.at))
    const ids = []
    if (stageObj.type === 'announce' || stageObj.type === 'turn') {
      ids.push(setTimeout(next, stageObj.ms))
      if (stageObj.type === 'announce') ids.push(setTimeout(() => sayLine(`round_${stageObj.round.kind}`), LINE_AT_MS))
      else if (s.idx === stages.findIndex(x => x.type === 'turn')) ids.push(setTimeout(() => sayLine('your_turn'), LINE_AT_MS)) // «твоя очередь» — только в первый раз
    }
    else if (stageObj.type === 'dictor') {
      const { plan } = stageObj
      for (const r of plan.reps) {
        if (r.mode === 'clip' && r.row) ids.push(setTimeout(() => sayClip(r.row), left(r.at - AUDIO_LATENCY_MS))) // запись автора (финал: вся фраза)
        else for (const pc of r.pieces) ids.push(setTimeout(() => sayChunk(pc.chunk), left(pc.at - AUDIO_LATENCY_MS - pc.lead))) // куски по отдельности из библиотеки (голос в файле начинается через lead после включения)
      }
      ids.push(setTimeout(next, left(plan.listenMs)))
    }
    return () => { ids.forEach(clearTimeout); stopVoice() }
  }, [s.stage, s.idx, s.at, stageObj, sayChunk, sayClip, next, stages])

  // Слушатель: живёт со «своей очереди» (turn) и всю ступень ученика; у каждой ступени свои цели
  const listenStep = s.stage === 'run' ? listenStepOf(stages, s.idx) : null
  const listenId = listenStep?.id ?? null
  useEffect(() => {
    if (!listenStep) return undefined
    const { texts } = stepTargets(listenStep, chunks)
    const l = createWordListener({
      targets: texts, expected: listenStep.reps.length, level: rms, getStream: getGameMic,
      onChange: ({ status, seq, misses, heard, tail, heardAt }) => {
        signalRef.current = { tail, heardAt }
        if (status === 'dead') { // игровой поток оглох (iOS заглушил) — переоткрываем микрофон и слушаем заново; без игрового потока (свой у распознавателя) делать нечего
          if (hasGameMic()) { pLog('[mic] игровой поток отдаёт тишину — переоткрываю'); dropGameMic(); openGameMic().then(r => { if (r === 'granted') setMicEpoch(e => e + 1) }) }
          return
        }
        setS(p => {
          const mic = status === 'listening' || status === 'starting' ? status : status === 'idle' ? p.mic : 'manual'
          const fresh = p.lid !== listenStep.id
          const sameSeq = !fresh && p.seq.length === seq.length
          const note = !fresh && misses > p.misses && sRef.current.stage === 'run' && stages[sRef.current.idx]?.type === 'student' ? `Услышал: «${heard || '…'}»` : p.note
          if (!fresh && sameSeq && p.misses === misses && p.note === note && p.mic === mic) return p // ничего не изменилось — React не перерисовываем
          return { ...p, lid: listenStep.id, seq, misses, note, mic }
        })
        if (misses > 0) { clearTimeout(noteTimerRef.current); noteTimerRef.current = setTimeout(() => setS(p => ({ ...p, note: '' })), 2600) }
      },
    })
    listenerRef.current = l
    l.start() // нет модели → onChange 'unavailable' → ручной режим
    return () => { l.dispose(); if (listenerRef.current === l) listenerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenId, rms, chunks, micEpoch])

  /** Тап по дорожке (раунд «Порядок»): ответ — в движке пилюль, он знает, какие пилюли сейчас на экране */
  const onLane = lane => sceneApi.current?.tap?.(lane)

  /** Тап по микрофону: в ручном режиме (распознавания нет) — «сказал» следующий текст ступени */
  const tapMic = () => {
    if (sRef.current.mic !== 'manual' || stages[sRef.current.idx]?.type !== 'student') return
    const target = sceneApi.current?.nextTarget?.()
    if (target == null) return
    setS(p => ({ ...p, seq: [...(p.lid === listenId ? p.seq : []), target], lid: listenId }))
  }

  const skip = () => { listenerRef.current?.dispose(); clearTimers(); next() }

  const scene = useMemo(() => {
    if (s.stage !== 'run' || !stageObj) return IDLE
    if (stageObj.type === 'dictor') return { kind: 'dictor', plan: stageObj.plan, at: s.at }
    if (stageObj.type === 'student') return { kind: 'student', step: stageObj.step, chunks, estMs: c => chunkMs[c], curves: chunkCurves, at: s.at }
    if (stageObj.type === 'order') return { kind: 'order', prompts: stageObj.prompts, lanes, count: chunks.length, at: s.at }
    return IDLE
  }, [s.stage, s.at, stageObj, chunks, chunkMs, chunkCurves, lanes])

  const live = { seq: s.lid === listenId ? s.seq : [], misses: s.lid === listenId ? s.misses : 0, signal: () => signalRef.current }
  const phase = s.stage === 'run' ? (stageObj?.type ?? 'idle') : s.stage
  const labels = labelsFor(stageObj?.type === 'announce' ? stages[s.idx + 1] : stageObj, chunks, lanes, s.hint) // под плашкой раунда уже видны подписи следующей стадии
  const plate = stageObj?.type === 'announce' ? stageObj.round.title : stageObj?.type === 'turn' ? 'Теперь твоя очередь' : ''
  return { ...s, catLine: cat.text, phase, stageObj, scene, live, labels, plate, plateMs: stageObj?.ms ?? 0, levels, fx, sceneApi, onLane, dismissXp, tapMic, skip, finish, translation, text: textOf(chunks, chunks.map((_, i) => i)) }
}
