// «Гонка с Питом»: акты рецепта (raceRecipe.js) → плоский список стадий в ТОМ ЖЕ формате, что у rehearsalStages.js / wordLaneStages.js (директор useWordLaneFlow проходит их по порядку). wordLaneStages.buildStages
// делегирует сюда, когда у плана game === 'race'. Раунды по файлам: raceStagesSprint.js, raceStagesCatch.js, raceStagesClimb.js, raceStagesDescent.js; общее — raceStageKit.js.
// Стадии гонки (все с race: true и act): announce — плашка раунда с репликой Пита (line); student — «Разгон» (одна ступень на все пилюли), ступени лестницы «Вершины», ответ «Спуска»; discern — заход «Слушай и лови»
// (speak: ответ голосом); read / turn — читка Пита в «Спуске»; summary — итог. buildStages возвращает { recipe, stages, chunkMs, chunkCurves, lanes, clipMode }, как buildStages движка.
import { orderLanes } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { rngFor } from '../rehearsal/rehearsalSeed.js'
import { buildRaceActs } from './raceRecipe.js'
import { createKit } from './raceStageKit.js'
import { sprintStages } from './raceStagesSprint.js'
import { catchStages } from './raceStagesCatch.js'
import { climbStages } from './raceStagesClimb.js'
import { descentStages } from './raceStagesDescent.js'

const ROUNDS = { sprint: sprintStages, catch: catchStages, climb: climbStages, descent: descentStages }

/** → { recipe, stages, chunkMs, chunkCurves, lanes, clipMode } — как buildStages (wordLaneStages.js) */
export function buildRaceStages({ plan, rate = 1, lib = () => null }) {
  const kit = createKit({ plan, rate, lib })
  const { acts } = buildRaceActs(plan)
  for (const act of acts) {
    if (ROUNDS[act.id]) ROUNDS[act.id](kit, act)
    else kit.push({ type: 'summary', act: 'summary', sid: 'summary', line: null }) // итог: реплику говорит директор (useRaceActs): золото или обычная
  }
  const { chunks } = plan
  const r = kit.rate
  return { recipe: { chunks, rounds: [], acts, plan }, stages: kit.stages, chunkMs: chunks.map((c, i) => (lib(i)?.ms ?? estChunkMs(c)) / r), chunkCurves: chunks.map(() => null), lanes: orderLanes(chunks.length, rngFor(plan.seed, 'lanes')), clipMode: () => false }
}
