import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { createRmsLevel } from '../../../../shared/lib/vosk/sayVoskLevel.js'
import { createWordListener } from './wordLaneListen.js'
import { speakWord, playTrack, stopVoice } from './wordLaneVoice.js'
import { playNote, releaseNotes } from './wordLaneNotes.js'
import { buildStages, listenStepOf, labelsFor } from './wordLaneStages.js'
import { stepTargets, textOf } from './wordLaneRecipe.js'
import { clipsFor, playSpan } from './wordLaneAudio.js'
import { createOrderGame, tapLane, REPLAY_MS } from './wordLaneOrder.js'
import { DROP_MS, LANES_MS } from './wordLaneTimeline.js'
import { XP_PER_PILL, sensitiveLevel } from './wordLaneConfig.js'
import { getVoiceRate } from '../../lessonVolume.js'

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
const FIRST_PROMPT_MS = 900
const NEXT_PROMPT_MS = 800

const IDLE = { kind: 'idle' }

export function useWordLaneFlow({ chunks, translation, lang, clips = null, audioSrc = null, audio = null, catApi = null, onFinished }) {
  const [rate] = useState(getVoiceRate) // скорость голоса урока: на неё растянут план диктора
  const built = useMemo(() => buildStages({ chunks, clips, audio, rate }), [chunks, clips, audio, rate])
  const { stages, chunkMs, chunkCurves, lanes } = built
  const [s, setS] = useState({ stage: 'drop', idx: 0, at: 0, xp: 0, xpEvents: [], note: '', lid: '', seq: [], misses: 0, mic: 'starting', hint: [] })
  const sRef = useRef(s)
  const listenerRef = useRef(null)
  const finishedRef = useRef(false)
  const sceneApi = useRef(null)          // движок отвечает: order — ok / wrong / hint / reset; student — nextTarget()
  const orderRef = useRef(null)
  const timersRef = useRef(new Set())
  const xpIdRef = useRef(0)
  const noteTimerRef = useRef(0)
  const hintTimerRef = useRef(0)
  const [rms] = useState(() => createRmsLevel({ fromRms: sensitiveLevel })) // громкость голоса ученика (кольца микрофона, ворота)
  const [levels] = useState(() => createLevelSource(t => rms.read(t)))
  useEffect(() => { sRef.current = s })

  const later = useCallback((fn, ms) => { const id = setTimeout(() => { timersRef.current.delete(id); fn() }, Math.max(0, ms)); timersRef.current.add(id); return id }, [])
  const clearTimers = useCallback(() => { timersRef.current.forEach(clearTimeout); timersRef.current.clear() }, [])
  const go = useCallback((stage, idx = 0) => setS(p => ({ ...p, stage, idx, at: performance.now(), hint: [] })), [])
  const next = useCallback(() => { const i = sRef.current.idx + 1; if (i >= stages.length) go('reveal', i); else go('run', i) }, [go, stages.length])
  const stageObj = s.stage === 'run' ? stages[s.idx] : null

  // Озвучить высказывание из кусков parts: клип общего файла озвучки (перемоткой) или голос системы по тексту
  const say = useCallback((parts, repIdx = 0) => {
    const row = audioSrc ? clipsFor(clips, chunks.length, parts, repIdx) : null
    if (row) playTrack(audioSrc, playSpan(row))
    else speakWord(textOf(chunks, parts), lang)
  }, [audioSrc, clips, chunks, lang])

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
      flash('Не успел — говори, пока пилюли на экране')
      const st = stages[sRef.current.idx]
      if (st?.step && !st.step.labels.length) { // вслепую: после «не успел» показываем, что это за кусок
        setS(p => ({ ...p, hint: e.rep.parts }))
        clearTimeout(hintTimerRef.current)
        hintTimerRef.current = setTimeout(() => setS(p => ({ ...p, hint: [] })), HINT_MS)
      }
    },
    mouth(level) { catApi?.current?.mouth(level) },
    finished() { const at = sRef.current.idx; later(() => { if (sRef.current.idx === at && sRef.current.stage === 'run') next() }, EXIT_PAUSE_MS) },
  }
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers })
  const [fx] = useState(() => ({
    win: (...a) => handlersRef.current.win(...a), miss: (...a) => handlersRef.current.miss(...a), fail: (...a) => handlersRef.current.fail(...a),
    mouth: (...a) => handlersRef.current.mouth(...a), finished: (...a) => handlersRef.current.finished(...a),
  }))

  const dismissXp = useCallback(id => setS(p => {
    const ev = p.xpEvents.find(e => e.id === id)
    return ev ? { ...p, xp: p.xp + ev.amount, xpEvents: p.xpEvents.filter(e => e.id !== id) } : p
  }), [])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    stopVoice(); releaseNotes(); clearTimers()
    listenerRef.current?.dispose()
    onFinished?.()
  }, [onFinished, clearTimers])

  useEffect(() => () => { stopVoice(); releaseNotes(); clearTimeout(noteTimerRef.current); clearTimeout(hintTimerRef.current); timersRef.current.forEach(clearTimeout); listenerRef.current?.dispose() }, [])

  // Вступление
  useEffect(() => {
    if (s.stage === 'drop') { const t = setTimeout(() => go('lanes'), DROP_MS); return () => clearTimeout(t) }
    if (s.stage === 'lanes') { const t = setTimeout(() => go('run', 0), LANES_MS); return () => clearTimeout(t) }
    return undefined
  }, [s.stage, go])

  // Стадии: свои таймеры, смена стадии их чистит
  useEffect(() => {
    if (s.stage !== 'run' || !stageObj) return undefined
    const left = at => Math.max(0, at - (performance.now() - s.at))
    const ids = []
    if (stageObj.type === 'announce' || stageObj.type === 'turn') ids.push(setTimeout(next, stageObj.ms))
    else if (stageObj.type === 'dictor') {
      const { plan } = stageObj
      plan.reps.forEach(r => ids.push(setTimeout(() => say(r.parts, r.idx), left(r.at - AUDIO_LATENCY_MS))))
      ids.push(setTimeout(next, left(plan.listenMs)))
    } else if (stageObj.type === 'order') {
      orderRef.current = createOrderGame({ prompts: stageObj.prompts, lanes })
      const play = () => { const g = orderRef.current; if (g && !g.finished) say(g.prompts[g.i].parts) }
      ids.push(setTimeout(play, FIRST_PROMPT_MS))
      orderRef.current.replay = () => { clearTimeout(orderRef.current.replayId); orderRef.current.replayId = setTimeout(() => { play(); orderRef.current?.replay?.() }, REPLAY_MS) }
      orderRef.current.play = play
    }
    return () => { ids.forEach(clearTimeout); if (orderRef.current) { clearTimeout(orderRef.current.replayId); orderRef.current = null }; stopVoice() }
  }, [s.stage, s.idx, s.at, stageObj, say, next, lanes])

  // Слушатель: живёт со «своей очереди» (turn) и всю ступень ученика; у каждой ступени свои цели
  const listenStep = s.stage === 'run' ? listenStepOf(stages, s.idx) : null
  const listenId = listenStep?.id ?? null
  useEffect(() => {
    if (!listenStep) return undefined
    const { texts } = stepTargets(listenStep, chunks)
    const l = createWordListener({
      targets: texts, expected: listenStep.reps.length, level: rms,
      onChange: ({ status, seq, misses, heard }) => {
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
  }, [listenId, rms, chunks])

  /** Тап по дорожке (раунд «Порядок») */
  const onLane = lane => {
    const g = orderRef.current
    if (!g || g.finished) return
    for (const e of tapLane(g, lane)) {
      if (e.type === 'ok') { sceneApi.current?.ok?.(e.lane); catApi?.current?.react('love', 900) }
      else if (e.type === 'wrong') { sceneApi.current?.wrong?.(e.lane); if (e.hint) sceneApi.current?.hint?.(e.expected); catApi?.current?.react('shy', 900); g.replay?.() }
      else if (e.type === 'next') { g.replay?.(); if (e.prompt) later(() => { sceneApi.current?.reset?.(); g.play?.() }, NEXT_PROMPT_MS) }
      else if (e.type === 'done') { const at = sRef.current.idx; later(() => { if (sRef.current.idx === at) next() }, EXIT_PAUSE_MS) }
      if (e.type === 'ok') handlers.win(e.step - 1, null) // XP и нота за верный тап
    }
  }

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
    if (stageObj.type === 'order') return { kind: 'order', count: chunks.length, lanes, at: s.at }
    return IDLE
  }, [s.stage, s.at, stageObj, chunks, chunkMs, chunkCurves, lanes])

  const live = { seq: s.lid === listenId ? s.seq : [], misses: s.lid === listenId ? s.misses : 0 }
  const phase = s.stage === 'run' ? (stageObj?.type ?? 'idle') : s.stage
  const labels = labelsFor(stageObj?.type === 'announce' ? stages[s.idx + 1] : stageObj, chunks, lanes, s.hint) // под плашкой раунда уже видны подписи следующей стадии
  const plate = stageObj?.type === 'announce' ? stageObj.round.title : stageObj?.type === 'turn' ? 'Теперь твоя очередь' : ''
  return { ...s, phase, stageObj, scene, live, labels, plate, plateMs: stageObj?.ms ?? 0, levels, fx, sceneApi, onLane, dismissXp, tapMic, skip, finish, translation, text: textOf(chunks, chunks.map((_, i) => i)) }
}
