// Раунд 3 «Вершина» → стадии: по стадии на каждую ступень (N слов фразы). Ступень k — один заход ученика: сказать ПЕРВЫЕ k слов фразы одним высказыванием (цель — «i am trying»; словарь Vosk — слова фразы и двойники
// k-го слова, maxWords не больше 2: словарь растёт степенью). Времени на ступень нет: пилюля движка едет очень медленно (rep.speed, y0 — raceClimbTimer.js) и скрыта, а время ограничивает ОБЩИЙ таймер подъёма
// (директор useRaceActs: 12 с + 5 с за ступень). Сказал не то — директор сам перезапускает стадию (соскальзывание); maxTries 1. Острова рисует RaceClimb.jsx по событиям директора. Какая ступень идёт следом
// (k+1 после попадания, ниже после промаха), решает nextIdx директора по состоянию лестницы (raceLadder.js): стадии ступеней в списке один раз и могут проходиться снова.
// После ступеней — плашка вершины (climb-top: золотая плашка, реплика race_climb_top) и плашка «время вышло» (climb-time: реплика race_climb_time; в обычном порядке её перескакивает climbTarget).
import { stepOf, RACE_TOP_MS } from './raceStageKit.js'
import { CLIMB_STEP_SPEED, CLIMB_PILL_Y0 } from './raceClimbTimer.js'
import { vocabOf } from './raceWords.js'

export function climbStages(kit, act) {
  const { push, announce, msOf } = kit
  const words = act.words
  announce(act)
  words.forEach((word, i) => {
    const k = i + 1
    const text = words.slice(0, k).join(' ')
    const step = stepOf(`climb-${k}`, { parts: [0], text, chunks: [text], chunkMs: [msOf(text)], reps: [{ parts: [0], speed: CLIMB_STEP_SPEED, y0: CLIMB_PILL_Y0 }], extra: vocabOf([text], [...kit.doubles(word), ...words]), maxWords: Math.min(k, 2), maxTries: 1 })
    push({ type: 'student', act: 'climb', sid: `climb-${k}`, k, n: words.length, step, word })
  })
  push({ type: 'announce', act: 'climb', sid: 'climb-top', round: { kind: 'climb_top', title: '' }, ms: RACE_TOP_MS, line: act.topLine })
  push({ type: 'announce', act: 'climb', sid: 'climb-time', round: { kind: 'climb_time', title: '' }, ms: RACE_TOP_MS, line: act.timeLine })
}
