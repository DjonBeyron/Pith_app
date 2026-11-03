import { useState, useRef, useEffect, useCallback } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { useRehearsalActs } from '../rehearsal/useRehearsalActs.js'
import { setRateBoost } from '../player/modules/rotate-phone/wordLaneBuffers.js'
import { makeBox, putState, setHinted, takeHinted, markEntered, reduceRace, climbTarget } from './raceState.js'
import { reportRace } from './raceSim.js'
import { DESCENT_RATE } from './raceRecipe.js'

// Директор «Гонки с Питом» (CONCEPT_RACE.md) поверх директора репетиции: useWordLaneFlow зовёт ЭТОТ хук вместо useRehearsalActs. Без плана гонки (plan.game !== 'race') он возвращает то, что вернул бы useRehearsalActs, —
// остальные хуки внутри бездействуют. Что делает для гонки сверх репетиции (реплики на старте стадий, отсчёт, тишина экрана, вступление race_start, пауза — всё это уже у useRehearsalActs, он знает про plan.game):
//  • состояние раундов (raceState.js): реакции движка win / miss / fail приходят в rec(kind, info) → серия «Разгона» (3 — золото и «ну, погнали», 5 — «огонь»), заходы «Слушай и лови», лестница «Вершины»; экран читает rh.race;
//  • nextIdx: после ступени лестницы идёт стадия не «следующая по списку», а та, что решает лестница (k + 1 после попадания, ниже после соскальзывания, плашка вершины — после верха; raceState.climbTarget);
//  • подсказка «Вершины»: на 2-м промахе одной ступени Пит говорит новое слово голосом (sayText), реплика соскальзывания в этот раз пропускается (failLine); 3-й промах — подпись мигает (race.climb.blink);
//  • «Спуск»: на время читки и ответа слова и куски играют с playbackRate 1,1 (wordLaneBuffers.setRateBoost);
//  • итог: на экране summary — raceSim.reportRace (память сессии и XP тем же путём, что у репетиции), Пит говорит race_done_gold или race_done; result — для RaceSummary;
//  • журнал отладки: строки «[race] …» (раунд, слово, попал / промах, серия, ступень, заходы, итог).
export function useRaceActs(args) {
  const { plan, stages, stage, at, stageObj, sayLine, sayText } = args
  const rh = useRehearsalActs(args)
  const on = plan?.game === 'race'
  const running = on && stage === 'run' ? stageObj : null
  const [box] = useState(makeBox) // s — актуальное состояние (читает nextIdx без перерисовки), hinted — подсказка голосом сказана на этом промахе (raceState.makeBox)
  const [view, setView] = useState(box.s)
  const [result, setResult] = useState(null)
  const sayRef = useRef({ sayLine, sayText }) // свежие реплики берёт эффект ниже; первый рендер — из аргументов
  useEffect(() => { sayRef.current = { sayLine, sayText } })

  const apply = useCallback(ev => {
    const r = reduceRace(box.s, ev)
    if (r.state === box.s && !r.say && !r.hint && !r.log) return
    putState(box, r.state); setView(r.state)
    if (r.log) pLog(`[race] ${r.log}`)
    if (r.say) sayRef.current.sayLine?.(r.say)
    if (r.hint) { setHinted(box, r.hint); sayRef.current.sayText?.(ev.stage.word) } // подсказка «Вершины»: новое слово голосом из библиотеки
  }, [box])

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
  const nextIdx = useCallback(i => (on ? climbTarget(stages, stages[i - 1], box.s) ?? baseNext(i) : baseNext(i)), [on, stages, box, baseNext])
  if (!on) return rh
  return {
    ...rh, result, race: view, nextIdx,
    rec(kind, info) { rh.rec(kind, info); if (running) apply({ t: kind, stage: running, info }) },
    // Реплика на «не успел»: «Вершина» — «ой, соскользнул» (при подсказке голосом — тишина, говорит слово), остальные раунды без реплик (ответ «Слушай и лови» — в редюсере)
    failLine(st) { if (st?.act === 'climb') return takeHinted(box) ? '' : 'race_climb_slip'; return '' },
  }
}
