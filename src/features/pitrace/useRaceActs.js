import { useState, useRef, useEffect, useCallback } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { useRehearsalActs } from '../rehearsal/useRehearsalActs.js'
import { setRateBoost } from '../player/modules/rotate-phone/wordLaneBuffers.js'
import { makeBox, putState, markEntered, reduceRace, climbTarget, climbStageIdx } from './raceState.js'
import { leftMs, isOut } from './raceClimbTimer.js'
import { reportRace } from './raceSim.js'
import { DESCENT_RATE } from './raceRecipe.js'
import { sayTrap } from './raceTrapVoice.js'
import { sprintTarget } from './raceSprint2.js'
import { takeoffOn, playTakeoff } from './raceTakeoffSound.js'
import { GOOD_IDS, GOOD_DELAY_MS } from './raceGood.js'

// Директор «Гонки с Питом» (CONCEPT_RACE.md) поверх директора репетиции: useWordLaneFlow зовёт ЭТОТ хук вместо useRehearsalActs. Без плана гонки (plan.game !== 'race') он возвращает то, что вернул бы useRehearsalActs, —
// остальные хуки внутри бездействуют. Что делает для гонки сверх репетиции (реплики на старте стадий, отсчёт, тишина экрана, вступление race_start, пауза — всё это уже у useRehearsalActs, он знает про plan.game):
//  • состояние раундов (raceState.js): реакции движка win / miss / fail приходят в rec(kind, info) → «Разгон» и «Слушай и лови» (мини-реплики успеха на принятии слова, время ответа, два круга: raceGood.js, raceSprint2.js), лестница «Вершины»; экран читает rh.race;
//  • nextIdx: после ступени лестницы идёт стадия не «следующая по списку», а та, что решает лестница (k + 1 после попадания, ниже после соскальзывания, плашка вершины — после верха; raceState.climbTarget);
//  • подсказка «Вершины»: на 2-м промахе одной ступени Пит говорит новое слово голосом (sayText), реплика соскальзывания в этот раз пропускается (её говорит редюсер); 3-й промах — подпись мигает (race.climb.blink);
//  • ловушка-двойник (raceTrap.js): на промахе директор берёт у слушателя, что услышал Vosk (listener.heard()), редюсер узнаёт двойника — Пит говорит «это двойник, а нужно слово» по кускам (raceTrapVoice.js), вместо «соскользнул» и подсказки;
//  • «Вершина»: сказал не то (miss) — соскальзывание сразу, стадия ступени перезапускается (jump); общий таймер подъёма (raceClimbTimer.js) — когда время вышло, переход на плашку climb-time;
//  • «Спуск»: на время читки и ответа слова и куски играют с playbackRate 1,1 (wordLaneBuffers.setRateBoost);
//  • итог: на экране summary — raceSim.reportRace (память сессии и XP тем же путём, что у репетиции), Пит говорит race_done_gold или race_done; result — для RaceSummary;
//  • журнал отладки: строки «[race] …» (раунд, слово, попал / промах, серия, ступень, заходы, итог).
export function useRaceActs(args) {
  const { plan, stages, stage, at, stageObj, setS, sayLine, sayLineLater, sayText, lines, rate, listenerRef } = args
  const rh = useRehearsalActs(args)
  const on = plan?.game === 'race'
  const running = on && stage === 'run' ? stageObj : null
  const [box] = useState(makeBox) // s — актуальное состояние (читает nextIdx без перерисовки), hinted — подсказка голосом сказана на этом промахе (raceState.makeBox)
  const [view, setView] = useState(box.s)
  const [result, setResult] = useState(null)
  const sayRef = useRef({ sayLine, sayLineLater, sayText, lines, rate }) // свежие реплики берёт эффект ниже; первый рендер — из аргументов
  useEffect(() => { sayRef.current = { sayLine, sayLineLater, sayText, lines, rate } })
  const trapRef = useRef(() => {}) // отмена недосказанной подсказки про двойника (стадия сменилась, выход)
  useEffect(() => () => trapRef.current(), [])

  const apply = useCallback(ev => {
    const r = reduceRace(box.s, { ...ev, now: performance.now() })
    if (r.state === box.s && !r.say && !r.hint && !r.log) return
    putState(box, r.state); setView(r.state)
    if (r.log) pLog(`[race] ${r.log}`)
    if (r.say) { if (ev.t === 'claim' && GOOD_IDS.includes(r.say) && sayRef.current.sayLineLater) sayRef.current.sayLineLater(r.say, null, GOOD_DELAY_MS); else sayRef.current.sayLine?.(r.say) } // похвала за верное слово — не в момент зачёта, а через GOOD_DELAY_MS (пилюля успевает взлететь); Пит занят с самого зачёта, следующая пилюля ждёт
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
    const t = setTimeout(() => { const res = reportRace({ plan, race: box.s }); setResult(res); sayRef.current.sayLine?.(res.gold ? 'race_done_gold' : 'race_done') }, 0)
    return () => clearTimeout(t)
  }, [on, running, plan, box])

  const baseNext = rh.nextIdx // стабильна (useCallback в useRehearsalActs): на ней держится next директора
  const seed = plan?.seed
  const nextIdx = useCallback(i => (on ? climbTarget(stages, stages[i - 1], box.s) ?? sprintTarget(stages, stages[i - 1], box.s[stages[i - 1]?.act], seed) ?? baseNext(i) : baseNext(i)), [on, stages, box, baseNext, seed])
  if (!on) return rh
  return {
    ...rh, result, race: view, nextIdx,
    /** Слово «Разгона» / «Слушай и лови» принято (раньше, чем щёлкнет заливка): время ответа ms (от выезда пилюли) — в результаты; Пит говорит мини-реплику успеха, следующая пилюля ждёт его */
    claim(rep, ms) { if (running) apply({ t: 'claim', stage: running, info: { idx: rep?.idx, ms } }) },
    /** Перед выездом пилюли (движок: событие 'pre'): в «Разгоне» Пит говорит русский перевод слова из библиотеки (raceTrans.js), в «Слушай и лови» — английское слово (rep.say, библиотека слов); озвучки нет — молча, пилюля выезжает сразу.
     *  Пилюля ждёт, пока он договорит (pitLeft) */
    pre(rep) { if (running?.act === 'sprint' && rep?.cap) sayRef.current.sayText?.(rep.cap, { ru: true }); else if (running?.act === 'catch' && rep?.say) sayRef.current.sayText?.(rep.say, { hold: true }) },
    rec(kind, info) {
      rh.rec(kind, info)
      if (!running) return
      if (takeoffOn(running, kind, info)) playTakeoff() // взлёт принятой пилюли: короткое глиссандо ми → ля (только ступени-очереди гонки)
      apply({ t: kind, stage: running, info: kind === 'miss' ? { ...info, heard: listenerRef?.current?.heard?.() ?? '' } : info }) // на промахе — что услышал Vosk: двойник слова ступени ломает ловушку
      if (kind === 'miss' && running.act === 'climb' && running.type === 'student') jump(climbStageIdx(stages, box.s.climb)) // сказал не то — соскальзывание: ступень-стадия перезапускается (слово ступени звучит подсказкой при 2-м промахе)
    },
    // Реплик на «не успел» из директора игры нет: «ой, соскользнул» «Вершины» говорит редюсер (raceState.js)
    failLine: () => '',
  }
}
