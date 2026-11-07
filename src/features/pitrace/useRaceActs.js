import { useState, useRef, useEffect, useCallback } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { useRehearsalActs } from '../rehearsal/useRehearsalActs.js'
import { setRateBoost } from '../player/modules/rotate-phone/wordLaneBuffers.js'
import { makeBox, putState, markEntered, reduceRace, climbTarget, climbStageIdx } from './raceState.js'
import { leftMs, isOut } from './raceClimbTimer.js'
import { reportRace } from './raceSim.js'
import { memoryOn, outcomesOf, pushRaceMemory } from './raceMemory.js'
import { DESCENT_RATE } from './raceRecipe.js'
import { sayTrap } from './raceTrapVoice.js'
import { extraTarget, isLate } from './raceExtraRound.js'
import { pillLifeMs } from './raceAccuracy.js'
import { useRaceSwitch } from './useRaceSwitch.js'
import { takeoffOn, playTakeoffAfter } from './raceTakeoffSound.js'
import { rewardMs } from '../player/modules/rotate-phone/wordLaneNotes.js'
import { ALL_GOOD_IDS } from './raceGood.js'
import { useRaceSpeech, speakTranslation } from './useRaceSpeech.js'
import { createRuJournal } from './raceRuLog.js'
import { createSurfaceWait } from './raceDiveWait.js'
import { LOCK_MS } from './raceSpeech.js'
import { createPhraseVoice } from './racePhraseVoice.js'
import { phraseEvent, fillPhrases2 } from './raceStatePhrases.js'
import { useRacePhraseDemo } from './useRacePhraseDemo.js'

/** Журнал голоса перевода: какое слово и какой перевод Пит говорит перед выездом этой пилюли (одна запись повтора: слово, перевод, дорожка, скорость). Расхождение с записью слова круга — строка «РАССИНХРОН» (не должно быть никогда) */
function logPre(stage, rep) {
  if (!rep || !['sprint', 'catch'].includes(stage?.act)) return
  const w = stage.words?.[rep.idx], want = stage.act === 'catch' ? w?.text : w?.translation
  pLog(`[race] голос: повтор ${rep.idx + 1}/${stage.words?.length ?? '?'}${stage.sid.endsWith('2') ? ' (второй круг)' : ''} слово «${w?.text ?? rep.text}», ${stage.act === 'catch' ? 'говорит слово' : 'перевод'} «${rep.say ?? rep.cap}», на пилюле «${rep.cap}», дорожка ${rep.lanes?.[0]}, скорость ${rep.speed}${w && want !== (rep.say ?? rep.cap) ? `; РАССИНХРОН: в записи слова «${want}»` : ''}`)
}

// Директор игры «Встряхни память» («Гонка с Питом», CONCEPT_RACE.md) поверх директора репетиции: useWordLaneFlow зовёт ЭТОТ хук вместо useRehearsalActs. Без плана гонки (plan.game !== 'race') он возвращает то, что вернул бы useRehearsalActs, —
// остальные хуки внутри бездействуют. Что делает для гонки сверх репетиции (реплики на старте стадий, отсчёт, тишина экрана, вступление race_start, пауза — всё это уже у useRehearsalActs, он знает про plan.game):
//  • состояние раундов (raceState.js): реакции движка win / miss / fail приходят в rec(kind, info) → «Разгон» и «Слушай и лови» (мини-реплики успеха на принятии слова, время ответа, два круга: raceGood.js, raceExtraRound.js), лестница «Вершины»; экран читает rh.race;
//  • nextIdx: после ступени лестницы идёт стадия не «следующая по списку», а та, что решает лестница (k + 1 после попадания, ниже после соскальзывания, плашка вершины — после верха; raceState.climbTarget);
//  • подсказка «Вершины»: на 2-м промахе одной ступени Пит говорит новое слово голосом (sayText), реплика соскальзывания в этот раз пропускается (её говорит редюсер); 3-й промах — подпись мигает (race.climb.blink);
//  • ловушка-двойник (raceTrap.js): на промахе директор берёт у слушателя, что услышал Vosk (listener.heard()), редюсер узнаёт двойника — Пит говорит «это двойник, а нужно слово» по кускам (raceTrapVoice.js), вместо «соскользнул» и подсказки;
//  • «Вершина»: сказал не то (miss) — соскальзывание сразу, стадия ступени перезапускается (jump); общий таймер подъёма (raceClimbTimer.js) — когда время вышло, переход на плашку climb-time;
//  • «Спуск»: на время читки и ответа слова и куски играют с playbackRate 1,1 (wordLaneBuffers.setRateBoost);
//  • итог: на экране summary — raceSim.reportRace (память сессии и XP тем же путём, что у репетиции), Пит говорит race_done_gold или race_done; result — для RaceSummary; память слов — raceMemory.pushRaceMemory (source 'game', один раз за игру, не на стенде);
//  • журнал отладки: строки «[race] …» (раунд, слово, попал / промах, серия, ступень, заходы, итог).
export function useRaceActs(args) {
  const { plan, stages, stage, at, stageObj, setS, sayLine, sayLineLater, sayText, lines, rate, listenerRef } = args
  const on = plan?.game === 'race'
  const sw = useRaceSwitch({ on, running: on && stage === 'run' ? stageObj : null, stages }) // переключение слуха между проходами (английская ↔ русская модель Vosk, raceSwitch.js)
  const speech = useRaceSpeech({ on, cat: args.cat, sayLine }) // секвенсор речи (raceSpeech.js): зачёт → похвала → перевод → выезд; свои отступы от РЕАЛЬНОГО конца речи
  const rh = useRehearsalActs(on && args.cat ? { ...args, cat: { ...args.cat, busyLeft: () => Math.max(args.cat.busyLeft(), speech.pendingMs()) } } : args) // расписание реплик этапа знает, что похвала ещё впереди
  const praiseRef = useRef(null) // похвала, которую reduceRace назначил на этот зачёт (apply → claim)
  const running = on && stage === 'run' ? stageObj : null
  const demo = useRacePhraseDemo({ on, running, cat: args.cat, sayLine, sayText, lines }) // демо «можно по словам» на плашке круга «Скажи» (racePhraseDemo.js): переход плашки ждёт его конца
  const [box] = useState(makeBox) // s — актуальное состояние (читает nextIdx без перерисовки), hinted — подсказка голосом сказана на этом промахе (raceState.makeBox)
  const [view, setView] = useState(box.s)
  const [result, setResult] = useState(null)
  const memSent = useRef(false) // игра уже записана в память слов (повтор экрана итога и перерисовки не пишут второй раз)
  const sayRef = useRef({ sayLine, sayLineLater, sayText, lines, rate }) // свежие реплики берёт эффект ниже; первый рендер — из аргументов
  const [phr] = useState(createPhraseVoice) // этап «Фразы»: голос Пита перед ходом и после итога (racePhraseVoice.js); свежие реплики и Пит — phr.use в эффекте
  useEffect(() => { sayRef.current = { sayLine, sayLineLater, sayText, lines, rate }; phr.use({ sayLine, sayText, cat: args.cat }) })
  useEffect(() => { const off = phr.bindStop(); return () => { off?.(); phr.stop() } }, [phr]) // пауза (cat.stop) / выход — цепочка обрывается
  const [ru] = useState(createRuJournal) // проход B на русской модели: одна строка журнала «[ru] …» на слово (raceRuLog.js)
  const ruLog = (rep, result, level) => { const w = running?.words?.[rep?.idx], line = ru.finish({ idx: rep?.idx, word: w?.text, expected: w?.translation, said: listenerRef?.current?.said?.(), level, result }); if (line) pLog(line) }
  const ruOn = running?.act === 'catch' && running?.step?.lang === 'ru'
  const [surface] = useState(() => createSurfaceWait({ log: pLog })) // «Говорю»: слово следующей пилюли ждёт, пока Пит вынырнет / допрыгнет на её дорожку (raceDiveWait.js)
  useEffect(() => () => surface.cancel(), [running, surface])
  const trapRef = useRef(() => {}) // отмена недосказанной подсказки про двойника (стадия сменилась, выход)
  useEffect(() => () => trapRef.current(), [])

  const apply = useCallback(ev => {
    const r = reduceRace(box.s, { ...ev, now: performance.now() })
    if (r.state === box.s && !r.say && !r.hint && !r.log) return
    putState(box, r.state); setView(r.state)
    if (r.log) pLog(`[race] ${r.log}`)
    if (r.say) { if (ALL_GOOD_IDS.includes(r.say)) praiseRef.current = r.say; else sayRef.current.sayLine?.(r.say) } // ЛЮБАЯ похвала — один путь: секвенсор речи (claim → speech.claim(id)): голос через GOOD_DELAY_MS после ВЗЛЁТА пилюли, перевод — через AFTER_GOOD_GAP_MS после РЕАЛЬНОГО конца похвалы
    if (r.hint) sayRef.current.sayText?.(ev.stage.word) // подсказка «Вершины»: новое слово голосом из библиотеки
    if (r.trap) { trapRef.current(); trapRef.current = sayTrap({ ...r.trap, ...sayRef.current }) } // ловушка: «это двойник, а нужно слово»
  }, [box])

  // Прыжок директора на стадию i (промах ступени, время вышло): стадия перезапускается с новой отметкой времени
  const jump = useCallback(i => { if (i >= 0) setS(p => ({ ...p, stage: 'run', idx: i, at: performance.now(), hint: [], leaving: -1 })) }, [setS])

  // Общий таймер «Вершины»: время вышло — подъём заканчивается на текущем островке, директор переходит на плашку climb-time (Пит: race_climb_time). Пересчитывается на каждой взятой ступени (добавка времени)
  const climbRun = running?.act === 'climb' && running.type === 'student'
  const cl = view.climb
  const clT0 = cl?.t0, clWins = cl?.wins, clDone = !cl || cl.top || cl.over || cl.timedOut
  useEffect(() => {
    if (!climbRun || clDone || clT0 == null) return undefined
    const t = setTimeout(() => {
      if (!isOut(box.s.climb, performance.now() + 20)) return
      apply({ t: 'timeout', stage: running })
      jump(climbStageIdx(stages, box.s.climb))
    }, leftMs({ t0: clT0, wins: clWins }, performance.now()) + 10)
    return () => clearTimeout(t)
  }, [climbRun, clDone, clT0, clWins, running, stages, apply, jump, box])

  // Начало стадии (раунд, заход, ступень лестницы): один раз на запуск стадии (at — её отметка времени)
  useEffect(() => {
    if (!running) return undefined
    const key = `${running.idx}:${at}`
    if (box.entered === key) return undefined
    markEntered(box, key)
    const t = setTimeout(() => apply({ t: 'enter', stage: running }), 0)
    return () => clearTimeout(t)
  }, [running, at, apply, box])

  // «Спуск»: слова и куски на скорости 1,1
  const descent = running?.act === 'descent' && ['read', 'turn', 'student'].includes(running.type)
  useEffect(() => {
    if (!on) return undefined
    setRateBoost(descent ? DESCENT_RATE : 1)
    return () => setRateBoost(1)
  }, [on, descent])

  // Итог: память и XP — один раз на выходе на экран summary
  useEffect(() => {
    if (!on || running?.type !== 'summary') return undefined
    const t = setTimeout(() => {
      const res = reportRace({ plan, race: box.s }); setResult(res); sayRef.current.sayLine?.(res.gold ? 'race_done_gold' : 'race_done')
      if (memoryOn(plan) && !memSent.current) { memSent.current = true; pushRaceMemory({ outcomes: outcomesOf(res), lessonId: plan.lessonId ?? null }).catch(e => pLog(`[memory] игра: сбой записи (${e?.message ?? e})`)) } // память слов: одно событие на слово, source 'game' (raceMemory.js), один раз за игру; результат — только в журнал
    }, 0)
    return () => clearTimeout(t)
  }, [on, running, plan, box])

  const baseNext = rh.nextIdx // стабильна (useCallback в useRehearsalActs): на ней держится next директора
  const seed = plan?.seed
  const nextIdx = useCallback(i => (on ? climbTarget(stages, stages[i - 1], box.s) ?? extraTarget(stages, stages[i - 1], box.s[stages[i - 1]?.act], seed) ?? fillPhrases2(stages, stages[i - 1], box.s) ?? baseNext(i) : baseNext(i)), [on, stages, box, baseNext, seed]) // fillPhrases2: после круга 1 фраз — порядок круга 2 (слабые последними)
  if (!on) return rh
  return {
    ...rh, result, race: view, nextIdx,
    afterCount: fn => rh.afterCount(() => demo.after(running, fn)), // плашка с stage.demo: сначала демо, потом следующая стадия
    /** Слово прохода A / B принято (раньше, чем щёлкнет заливка): время ответа ms (от выезда пилюли) и y (положение пилюли, % высоты: ниже LATE_Y — ответ «в последний момент») — в результаты, и для точности слова (raceAccuracy.js) — окно жизни пилюли по её скорости, заливка голосом в миг зачёта, тап ли это; Пит говорит мини-реплику успеха, следующая пилюля ждёт его */
    claim(rep, ms, y) { if (!running) return; if (ruOn) ruLog(rep, 'claim', rep?.pills?.[0]?.p); praiseRef.current = null; apply({ t: 'claim', stage: running, info: { idx: rep?.idx, ms, late: isLate(y), life: pillLifeMs(rep?.speed), fill: rep?.pills?.[0]?.p, tap: !!running.step?.tapOnly } }); speech.claim(praiseRef.current); praiseRef.current = null },
    /** Перед выездом пилюли (движок: событие 'pre'): в «Разгоне» Пит говорит русский перевод слова из библиотеки (raceTrans.js), в «Слушай и лови» — английское слово (rep.say, библиотека слов); озвучки нет — молча, пилюля выезжает сразу.
     *  Пилюля ждёт, пока он договорит (pitLeft) */
    pre(rep, e) {
      if (running?.act === 'phrases') { phr.pre(rep, e); return } // этап «Фразы»: смысл / фраза голосом Пита (racePhraseVoice.js), ход ждёт его через pitLeft
      logPre(running, rep)
      if (ruOn) { listenerRef?.current?.resetSaid?.(); ru.start(rep?.idx) } // новое слово прохода B: журнал слушает его с чистого листа
      const said = rep?.say ?? rep?.cap // проход A: Пит говорит перевод (rep.say); надпись пилюли (rep.cap) в тапе английская — её не озвучиваем (v3.3.127)
      const act = running?.act
      surface.run(e?.wait, () => { // e.wait — «Говорю»: Пит ещё ныряет / прыгает к дорожке этой пилюли; слово — когда он на месте (одна точка ожидания, журнал «[dodge] речь ждала…»)
        if (act === 'sprint' && said) speakTranslation(speech, o => sayRef.current.sayText?.(said, { ru: true, ...o }))
        else if (act === 'catch' && rep?.say) speakTranslation(speech, o => sayRef.current.sayText?.(rep.say, { hold: true, ...o }))
        else speech.translation(0) // говорить нечего: пилюля выезжает сразу
      })
    },
    /** Пит ещё занят (мс): секвенсор запрещает перевод до отступа после похвалы (LOCK_MS), иначе — реплики и перевод (cat.busyLeft) */
    pitLeft: () => Math.max(speech.holdMs(), args.cat?.busyLeft?.() ?? 0, sw.pendingMs(), surface.pending() ? LOCK_MS : 0, phr.left()), // идёт переключение слуха или Пит ещё выныривает к слову — пилюли тоже ждут
    rec(kind, info) {
      rh.rec(kind, info)
      if (!running) return
      if (running.act === 'phrases') { const ev = phraseEvent(kind, info); if (ev) apply({ t: 'phrase', stage: running, info: ev }); phr.react(kind, info); return } // итог хода «Фраз»: событие в результаты и голос Пита
      if (kind === 'win' && info?.last !== false) speech.riseStart() // пилюля взлетает: с этого мгновения идёт задержка похвалы
      if (ruOn && kind === 'miss') ru.miss(listenerRef?.current?.heard?.())
      if (ruOn && kind === 'fail') ruLog(info, 'fail', info?.peak)
      if (kind === 'fail' && ['sprint', 'catch'].includes(running.act)) speech.pillGone('missed') // «не успел»: отступ до перевода следующего слова
      if (takeoffOn(running, kind, info)) playTakeoffAfter(rewardMs(info?.order ?? 0)) // взлёт принятой пилюли: глиссандо ми → ля ПОСЛЕ ноты награды, а не вместе с ней (только ступени-очереди гонки)
      apply({ t: kind, stage: running, info: kind === 'miss' ? { ...info, heard: listenerRef?.current?.heard?.() ?? '' } : info }) // на промахе — что услышал Vosk: двойник слова ступени ломает ловушку
      if (kind === 'miss' && running.act === 'climb' && running.type === 'student') jump(climbStageIdx(stages, box.s.climb)) // сказал не то — соскальзывание: ступень-стадия перезапускается (слово ступени звучит подсказкой при 2-м промахе)
    },
    // Реплик на «не успел» из директора игры нет: «ой, соскользнул» «Вершины» говорит редюсер (raceState.js)
    failLine: () => '',
  }
}
