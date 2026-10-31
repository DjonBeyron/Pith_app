import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'
import { createRmsLevel } from '../../../../shared/lib/vosk/sayVoskLevel.js'
import { createWordListener } from './wordLaneListen.js'
import { speakWord, playTrack, stopVoice } from './wordLaneVoice.js'
import { playNote, releaseNotes } from './wordLaneNotes.js'
import { buildStages, listenStepOf, labelsFor } from './wordLaneStages.js'
import { stepTargets, textOf } from './wordLaneRecipe.js'
import { clipsFor, playSpan, estChunkMs } from './wordLaneAudio.js'
import { playClip, playWordSlot, releaseClips, speechOfUrl, wordBufferMs } from './wordLaneClips.js'
import { makeLib, libRow } from './wordLaneLib.js'
import { mouthTrack } from './wordLaneVisemes.js'
import { useCatLines } from './useCatLines.js'
import { useWordLaneDebug } from './useWordLaneDebug.js'
import { DROP_MS, LANES_MS } from './wordLaneTimeline.js'
import { XP_PER_PILL, sensitiveLevel } from './wordLaneConfig.js'
import { getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { getGameMic, closeGameMic, hasGameMic, dropGameMic, openGameMic } from '../../../../shared/lib/gameMic.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'
import { gameMicGesture, guardStream } from '../../../../shared/lib/gameMicGesture.js'
import { useWordLaneControls } from './useWordLaneControls.js'
import { useGameAudioModes, endGameAudio } from './useGameAudioModes.js'
import { scheduleDictor } from './wordLaneDictorRun.js'
import { useRehearsalActs } from '../../../rehearsal/useRehearsalActs.js'
import { engineKind, isStudentStage } from '../../../rehearsal/rehearsalKinds.js'

// Сценарий игры «Повтори за диктором» — директор. Рецепт (wordLaneRecipe) разложен на стадии (wordLaneStages); директор проходит их по порядку, у каждой стадии свои таймеры, и смена стадии их чистит.
// ВСЕ таймеры стадии считаются от одной точки — s.at (её же берёт движок пилюль), иначе голос и картинка расходились бы:
//  drop → lanes      слово/фраза падает сверху, проявляются три дорожки;
//  announce          плашка раунда;
//  dictor            диктор проговаривает повторы ступени: звук каждого повтора включается по плану (клип из общего файла или слот библиотеки слов; голоса системы нет), пилюли заливаются в такт речи;
//  turn              плашка «Теперь твоя очередь»; слушатель Vosk стартует уже под ней (тяжёлый запуск не мешает ходу пилюль);
//  student           повторы выкатываются сами, ученик успевает их сказать — распознавание (wordLaneListen) принимает цели, движок (useWordLanePills) решает судьбу пилюль;
//  order             раунд «Порядок»: подсказка диктора — ученик тапает дорожки (wordLaneOrder);
//  discern           раунд «Различи»: диктор говорит кусок, в дорожках он и слова-запутыватели — тап по верной (тот же движок, что у «Порядка»);
//  reveal            фраза и перевод; «Дальше» отпускает ноду.
// «Репетиция с Питом» (plan): стадии те же + warmup / read / take (для движка — student / dictor, engineKind), mirror и summary без движка; акты, журнал, реплики Пита — useRehearsalActs.
// Микрофон включается сам (доступ дан заранее). Распознавание только Vosk, ручного режима нет: модель готовит карточка до старта (RotatePhoneModule), отказ слушателя посреди игры — mic 'failed' (сообщение, «Ещё раз» retryMic, выход).
const EXIT_PAUSE_MS = 1300   // ступень закончена: заливка доходит до конца, щелчок, нота — и только потом дальше
const HINT_MS = 3500         // подпись дорожки, которую показали после «не успел» в раунде «вслепую»

const REVEAL_LINE_MS = 700   // «Отлично!» — чуть позже появления перевода
const LINE_AT_MS = 250       // реплика кота на плашке раунда — чуть позже появления плашки

const IDLE = { kind: 'idle' }

export function useWordLaneFlow({ chunks, translation, lang, clips = null, audioSrc = null, audio = null, catApi = null, lines = null, confusers = null, plan = null, forceDebug = false, onFinished }) {
  const [rate] = useState(getVoiceRate) // скорость голоса урока: на неё растянут план диктора
  const [lib] = useState(() => makeLib(chunks)) // озвучка кусков в библиотеке слов на момент старта игры (длины и наличие)
  const built = useMemo(() => buildStages({ chunks, clips, audio, rate, lib, confusers, plan }), [chunks, clips, audio, rate, lib, confusers, plan])
  const { stages, chunkMs, chunkCurves, lanes, clipMode } = built
  useEffect(() => { pLog(`[word-lane] диктор: ${audioSrc ? (clips ? 'озвучка автора, клипы найдены' : 'озвучка есть, но клипы кусков не найдены — куски играют слоты библиотеки слов') : 'без озвучки автора — куски из библиотеки слов (голоса системы нет)'}`) }, [audioSrc, clips])
  const [micEpoch, setMicEpoch] = useState(0) // растёт, когда микрофон переоткрыт: слушатель пересоздаётся на новом потоке
  const [s, setS] = useState({ stage: 'drop', idx: 0, at: 0, note: '', lid: '', seq: [], misses: 0, mic: 'starting', hint: [] })
  const xpApi = useRef(null)             // счётчик и летящие цифры XP живут в своём компоненте (WordLaneXp): каждая награда не перерисовывает оверлей, пилюли и кота
  const sRef = useRef(s)
  const listenerRef = useRef(null), finishedRef = useRef(false)
  const sceneApi = useRef(null)          // движок отвечает: order — tap(lane); student — nextTarget()
  const signalRef = useRef({ tail: null, heardAt: 0 }) // что слышит распознаватель прямо сейчас (недосказанная цель, когда последний раз что-то услышал) — без перерисовок React
  const timersRef = useRef(new Set())
  const noteTimerRef = useRef(0), hintTimerRef = useRef(0)
  const [rms] = useState(() => createRmsLevel({ fromRms: sensitiveLevel })) // громкость голоса ученика (кольца микрофона, ворота)
  const [levels] = useState(() => createLevelSource(t => rms.read(t)))
  useEffect(() => { sRef.current = s })
  const stageObj = s.stage === 'run' ? stages[s.idx] : null
  const dbg = useWordLaneDebug({ chunks, translation, lang, stage: s.stage, idx: s.idx, stageObj, force: forceDebug }) // «Скачать отладку»: журнал и запись микрофона; выключено — пустые функции
  const cat = useCatLines({ lines, rate, catApi, listenerRef }) // реплики кота: подпись + озвучка + рот по буквам
  const sayLineRef = useRef(cat.sayLine)
  useEffect(() => { sayLineRef.current = (...a) => { const said = cat.sayLine(...a); if (said) dbg.note(`cat:${a[0]}`); return said } }) // реплика кота попадает и в журнал отладки (окно mute вокруг неё)
  const sayLine = (...a) => sayLineRef.current(...a) // обработчики и таймеры стадий всегда берут свежую версию (настройки реплик могут догрузиться) — а стадия из-за этого не перезапускается
  const rh = useRehearsalActs({ plan, stages, stage: s.stage, at: s.at, stageObj, setS, sayLine, sayText: (...a) => handlersRef.current.sayText(...a), cat, lines, rate, lang, listenerRef }); const { nextIdx } = rh // акты репетиции: журнал, реплики Пита, правила пропуска

  const later = useCallback((fn, ms) => { const id = setTimeout(() => { timersRef.current.delete(id); fn() }, Math.max(0, ms)); timersRef.current.add(id); return id }, [])
  const clearTimers = useCallback(() => { timersRef.current.forEach(clearTimeout); timersRef.current.clear() }, [])
  const go = useCallback((stage, idx = 0) => setS(p => ({ ...p, stage, idx, at: performance.now(), hint: [] })), [])
  const next = useCallback(() => { const i = nextIdx(sRef.current.idx + 1); if (i >= stages.length) go('reveal', i); else go('run', i) }, [go, stages.length, nextIdx])

  // Звук куска: слот библиотеки слов (подготовлен в тапе «Начать») → озвучка библиотеки обычным путём → без звука (голоса системы нет, строка в журнале)
  const sayChunk = useCallback(i => {
    const r = libRow(chunks[i]); dbg.note('dictor')
    if (r && playWordSlot(r.key)) return
    speakWord(chunks[i])
  }, [chunks, dbg])
  // Звук записи автора (клип фразы целиком): клип в памяти → перемотка файла
  const sayClip = useCallback(row => { dbg.note('dictor'); const span = playSpan(row); if (!playClip(span)) playTrack(audioSrc, span) }, [audioSrc, dbg])
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
    win(order, rect, rep = { last: true, count: 1 }) { // rep — у ученика: последний ли это кусок повтора и сколько в нём кусков; раунды «Порядок» / «Различи» награждают пилюлю сразу
      rh.rec('win'); if (playNote(order)) { listenerRef.current?.mute(900); dbg.note('note') }
      catApi?.current?.react('love', 1600)
      catApi?.current?.peek?.()
      if (rep.last) xpApi.current?.add(XP_PER_PILL * rep.count, rect) // у повтора из нескольких кусков одна цифра («+6»), когда принят последний кусок
    },
    miss() { rh.rec('miss'); catApi?.current?.react('shy', 1300) },
    fail(e) {
      catApi?.current?.react('shy', 1300); rh.rec('fail')
      const st = stages[sRef.current.idx]
      const said = e.order || st?.type === 'take' ? false : sayLine(rh.failLine(st) ?? (st?.step?.reps?.[0]?.parts?.length > 1 ? 'split_words' : 'try_again')) // не получилось сказать несколько кусков — кот советует говорить раздельно
      if (!said) flash(e.order ? 'Не успел — тапай дорожки, пока пилюли на экране' : 'Не успел — говори, пока пилюли на экране')
      if (!e.order && st?.step && !st.step.labels.length) { // вслепую: после «не успел» показываем, что это за кусок
        setS(p => ({ ...p, hint: e.rep.parts }))
        clearTimeout(hintTimerRef.current)
        hintTimerRef.current = setTimeout(() => setS(p => ({ ...p, hint: [] })), HINT_MS)
      }
    },
    mouth(level, code) { catApi?.current?.mouth(level, code); if (dbg.enabled && isStudentStage(stages[sRef.current.idx])) dbg.gate(level > 0) }, // gate: голос после ворот (двигает пилюли) — пишем смену состояния
    peek(ms) { catApi?.current?.peek?.(ms) },
    sayText(text) { // «Различи»: звучит слово пилюли (верное или запутыватель) — из библиотеки слов, нет её — без звука; рот кота по буквам слова
      const r = libRow(text); dbg.note('word')
      if (!(r && playWordSlot(r.key))) speakWord(text)
      const sp = speechOfUrl(r?.row.url), k = rate > 0 ? rate : 1, file = wordBufferMs(r?.key) || (Number(r?.row.duration) > 0 ? Number(r.row.duration) * 1000 : 0)
      const ms = Math.round((sp?.ms ?? (file || estChunkMs(text))) / k), lead = Math.round((sp?.lead ?? 0) / k) // звук идёт с начала файла, слово — после тишины lead: рот стартует вместе со словом, а длится до конца файла
      const total = Math.round(Math.max(lead + ms, file / k))
      gameMicHold.holdFor(total)
      catApi?.current?.speak?.(mouthTrack(text, ms).map(x => ({ ...x, at: x.at + lead, end: x.end + lead })), total)
    },
    say(parts) { // подсказка раунда «Порядок»: кот выскакивает, диктор называет куски
      const word = stages[sRef.current.idx]?.sayText; if (word) { handlers.sayText(word); return } // репетиция, «Различи»: диктор называет слово, а не кусок фразы
      const sayMs = parts.reduce((sum, i) => sum + (lib(i)?.ms ?? estChunkMs(chunks[i])) / (rate > 0 ? rate : 1) + 80, 700)
      catApi?.current?.peek?.(sayMs)
      gameMicHold.holdFor(sayMs) // окно речи диктора (глушение дорожки / фаза аудиосессии — режимы проверки на iPhone)
      say(parts)
    },
    finished() { const at = sRef.current.idx; later(() => rh.leave(stages[at], () => { if (sRef.current.idx === at && sRef.current.stage === 'run') next() }), EXIT_PAUSE_MS) }, // rh.leave: дубль репетиции сначала дописывается (запись, слова), потом next
  }
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers })
  const [fx] = useState(() => ({
    win: (...a) => handlersRef.current.win(...a), miss: (...a) => handlersRef.current.miss(...a), fail: (...a) => handlersRef.current.fail(...a),
    mouth: (...a) => handlersRef.current.mouth(...a), peek: (...a) => handlersRef.current.peek(...a), say: (...a) => handlersRef.current.say(...a), sayText: (...a) => handlersRef.current.sayText(...a), finished: (...a) => handlersRef.current.finished(...a),
  }))

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true; dbg.event('finish')
    stopVoice(); releaseNotes(); releaseClips({ keepWarm: true }); clearTimers(); endGameAudio(); closeGameMic()
    listenerRef.current?.dispose()
    onFinished?.()
  }, [onFinished, clearTimers, dbg])

  useGameAudioModes(() => setMicEpoch(e => e + 1)) // режимы проверки на iPhone: тип аудиосессии и глушение дорожки на время речи (useGameAudioModes)
  useEffect(() => () => { closeGameMic(); stopVoice(); releaseNotes(); releaseClips({ keepWarm: true }); clearTimeout(noteTimerRef.current); clearTimeout(hintTimerRef.current); timersRef.current.forEach(clearTimeout); listenerRef.current?.dispose() }, [])

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
    let releaseHold = null
    const look = () => catApi?.current?.look // взгляд кота: ref читается в момент вызова (кот мог ещё не смонтироваться)
    if (stageObj.type === 'announce' || stageObj.type === 'turn') {
      ids.push(setTimeout(() => rh.afterCount(next), rh.holdMs(stageObj))) // отсчёт тремя нотами не обрывается сменой стадии (rh.afterCount)
      if (stageObj.type === 'announce') ids.push(setTimeout(() => sayLine(`round_${stageObj.round.kind}`), LINE_AT_MS))
      else if (s.idx === stages.findIndex(x => x.type === 'turn')) ids.push(setTimeout(() => sayLine('your_turn'), LINE_AT_MS)) // «твоя очередь» — только в первый раз
    }
    else if (engineKind(stageObj) === 'dictor') releaseHold = scheduleDictor({ plan: stageObj.plan, left, look, sayClip, sayChunk, next, ids }) // звук повторов, взгляд кота, окно речи (wordLaneDictorRun)
    else if (isStudentStage(stageObj)) look()?.lineStart() // очередь ученика: кот слушает, зрачки оживают
    return () => { ids.forEach(clearTimeout); releaseHold?.(); stopVoice(); if (['dictor', 'student'].includes(engineKind(stageObj))) look()?.lineEnd() }
    // catApi — ref родителя, стабилен; в зависимости не берём, чтобы стадия не перезапускалась
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.stage, s.idx, s.at, stageObj, sayChunk, sayClip, next, stages])

  // Слушатель: живёт со «своей очереди» (turn) и всю ступень ученика; у каждой ступени свои цели
  const listenStep = s.stage === 'run' ? listenStepOf(stages, s.idx) : null
  const listenId = listenStep?.id ?? null
  useEffect(() => {
    if (!listenStep) return undefined
    const { texts } = stepTargets(listenStep, listenStep.chunks ?? chunks) // репетиция: цель — слово (step.chunks), словарь Vosk шире цели (step.extra)
    let wordsHeard = 0
    const l = createWordListener({
      targets: [...texts, ...(listenStep.extra ?? [])], expected: listenStep.reps.length, maxWords: listenStep.maxWords, gate: !listenStep.record, restartMs: listenStep.record ? 0 : undefined, level: rms, getStream: guardStream(getGameMic), isHeld: gameMicHold.active, onDebug: dbg.enabled ? dbg.listen : null,
      onChange: ({ status, seq, misses, heard, tail, heardAt }) => {
        signalRef.current = { tail, heardAt }
        const words = seq.length * 8 + (tail?.tokens ?? 0) // растёт с каждым услышанным словом (недосказанная цель — по токенам, засчитанная — по номеру в seq)
        if (words > wordsHeard) catApi?.current?.look?.word() // граница слова ученика: кот чуть переводит взгляд
        wordsHeard = words
        if (status === 'timeout') { pLog('[word-lane] слушатель отработал своё время — запускаю заново'); setMicEpoch(e => e + 1); return } // долгая ступень: новый слушатель, счёт ступени начинается с нуля
        if (status === 'dead') { // игровой поток оглох (iOS заглушил) — переоткрываем микрофон и слушаем заново; без игрового потока (свой у распознавателя) делать нечего
          if (hasGameMic() && !gameMicGesture.needed()) { pLog('[mic] игровой поток отдаёт тишину — переоткрываю'); dropGameMic(); openGameMic().then(r => { if (r === 'granted') setMicEpoch(e => e + 1) }) }
          return
        }
        setS(p => {
          const mic = status === 'listening' || status === 'starting' ? status : status === 'unavailable' || status === 'error' ? 'failed' : p.mic // нет модели / микрофон не открылся — игра говорит об этом честно (WordLaneGame)
          const fresh = p.lid !== listenStep.id
          const sameSeq = !fresh && p.seq.length === seq.length
          const note = !fresh && misses > p.misses && sRef.current.stage === 'run' && isStudentStage(stages[sRef.current.idx]) ? `Услышал: «${heard || '…'}»` : p.note
          if (!fresh && sameSeq && p.misses === misses && p.note === note && p.mic === mic) return p // ничего не изменилось — React не перерисовываем
          return { ...p, lid: listenStep.id, seq, misses, note, mic }
        })
        if (misses > 0) { clearTimeout(noteTimerRef.current); noteTimerRef.current = setTimeout(() => setS(p => ({ ...p, note: '' })), 2600) }
      },
    })
    listenerRef.current = l
    l.start() // нет модели → onChange 'unavailable' → mic 'failed' (сообщение и выход)
    return () => { l.dispose(); if (listenerRef.current === l) listenerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenId, rms, chunks, micEpoch])

  // Колбэки стабильны (useCallback): на них держатся мемоизированные пилюли, кот и микрофон
  /** Тап по дорожке: раунд «Порядок» — ответ в движке пилюль (он знает, какие пилюли на экране); очередь ученика в режиме «тап вместо речи» (HUD) — следующая цель сказана, через слушатель */
  const onLane = useCallback(lane => { const api = sceneApi.current; if (api?.tap) api.tap(lane); else { const t = api?.nextTarget?.(); if (t != null) listenerRef.current?.tap(t) } }, [])
  const { retryMic, restartStage, pause } = useWordLaneControls({ stages, sRef, setS, setMicEpoch, clearTimers, listenerRef, noteTimerRef, hintTimerRef, finishedRef, catApi, cat, dbg }) // «Ещё раз», перезапуск ступени, пауза (сворачивание)

  const scene = useMemo(() => {
    if (s.stage !== 'run' || !stageObj) return IDLE
    const kind = engineKind(stageObj)
    if (kind === 'dictor') return { kind: 'dictor', plan: stageObj.plan, at: s.at }
    if (kind === 'student') return { kind: 'student', step: stageObj.step, chunks: stageObj.step.chunks ?? chunks, estMs: c => (stageObj.step.chunkMs ?? chunkMs)[c], curves: chunkCurves, at: s.at }
    if (kind === 'order' || kind === 'discern') return { kind: 'order', prompts: stageObj.prompts, lanes, count: chunks.length, at: s.at }
    return kind === 'mirror' && rh.compare ? { kind: 'mirror', layout: rh.compare, at: s.at } : IDLE // «Дубль и зеркало»: сравнение на остановленных дорожках (rh.compare — раскладка, когда Пит договорил)
  }, [s.stage, s.at, stageObj, chunks, chunkMs, chunkCurves, lanes, rh.compare])

  // «Слух» для движка пилюль: меняется только когда продвинулся счёт слов / промахов (не на каждую перерисовку) — иначе мемоизированные пилюли перерисовывались бы вместе с оверлеем.
  // signal: недосказанная цель и когда распознаватель последний раз что-то слышал (повторный черновик с тем же текстом слушатель пропускает, но «слышал» отмечает — heardAt)
  const live = useMemo(() => ({
    seq: s.lid === listenId ? s.seq : [], misses: s.lid === listenId ? s.misses : 0,
    signal: () => { const sg = signalRef.current; const h = listenerRef.current?.heardAt?.() ?? 0; return h > sg.heardAt ? { tail: sg.tail, heardAt: h } : sg },
  }), [s.lid, s.seq, s.misses, listenId])
  const phase = s.stage === 'run' ? (engineKind(stageObj) ?? 'idle') : s.stage
  const shown = s.stage === 'paused' && s.from === 'run' ? stages[s.idx] : stageObj // на паузе подписи дорожек остаются на месте
  const labels = labelsFor(rh.quiet ? null : shown?.type === 'announce' ? stages[s.idx + 1] : shown, chunks, lanes, [...s.hint, ...rh.hintLanes(shown)], rh.hl) // под плашкой раунда уже видны подписи следующей стадии
  const plate = !rh.plateOk ? '' : stageObj?.type === 'announce' ? stageObj.round.title : stageObj?.type === 'turn' ? 'Теперь твоя очередь' : ''
  return { ...s, stages, dbg, rh, next, catLine: cat.text, phase, stageObj, scene, live, labels, plate, plateMs: stageObj?.ms ?? 0, levels, fx, sceneApi, xpApi, onLane, retryMic, restartStage, pause, paused: s.stage === 'paused', pausedIntro: s.stage === 'paused' && s.from !== 'run', finish, translation, text: textOf(chunks, chunks.map((_, i) => i)) }
}
