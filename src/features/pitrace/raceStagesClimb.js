// Раунд 3 «Вершина» → стадии: по стадии на каждую ступень лестницы (N слов фразы). Ступень k — один заход ученика: сказать ПЕРВЫЕ k слов фразы одним высказыванием (цель — «i am trying»; словарь Vosk — слова фразы и двойники
// k-го слова, maxWords не больше 2: словарь растёт степенью). Пилюля движка едет, как обычно (молчание ≈ 4 с — «не успел», maxTries 1: промах не повторяется внутри стадии), но на экране скрыта: лестницу рисует RaceClimb.jsx
// по событиям директора. Какая ступень идёт следом (k+1 после попадания, ниже после промаха), решает nextIdx директора по состоянию лестницы (raceLadder.js): стадии ступеней в списке один раз и могут проходиться снова.
// После лестницы — плашка вершины (climb-top): золотая плашка и реплика race_climb_top.
import { stepOf, RACE_TOP_MS } from './raceStageKit.js'
import { vocabOf } from './raceWords.js'

export function climbStages(kit, act) {
  const { push, announce, msOf } = kit
  const words = act.words
  announce(act)
  words.forEach((word, i) => {
    const k = i + 1
    const text = words.slice(0, k).join(' ')
    const step = stepOf(`climb-${k}`, { parts: [0], text, chunks: [text], chunkMs: [msOf(text)], reps: [{ parts: [0] }], extra: vocabOf([text], [...kit.doubles(word), ...words]), maxWords: Math.min(k, 2), maxTries: 1 })
    push({ type: 'student', act: 'climb', sid: `climb-${k}`, k, n: words.length, step, word })
  })
  push({ type: 'announce', act: 'climb', sid: 'climb-top', round: { kind: 'climb_top', title: '' }, ms: RACE_TOP_MS, line: act.topLine })
}
