// Игра «Встряхни память» («Гонка с Питом»): акты рецепта (raceRecipe.js) → плоский список стадий в ТОМ ЖЕ формате, что у rehearsalStages.js / wordLaneStages.js (директор useWordLaneFlow проходит их по порядку). wordLaneStages.buildStages
// делегирует сюда, когда у плана game === 'race'. Раунды по файлам: raceStagesSprint.js, raceStagesCatch.js (оба — очередь пилюль, общая сборка в raceStageKit.js), raceStagesClimb.js, raceStagesDescent.js; общее — raceStageKit.js.
// Стадии гонки (все с race: true и act): announce — плашка раунда с репликой Пита (line); student — «Разгон» и «Слушай и лови» (одна ступень на все пилюли круга), ступени лестницы «Вершины», ответ «Спуска»; read / turn — читка Пита в «Спуске»; summary — итог. buildStages возвращает { recipe, stages, chunkMs, chunkCurves, lanes, clipMode }, как buildStages движка.
import { orderLanes } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { rngFor } from '../rehearsal/rehearsalSeed.js'
import { pLog } from '../../shared/lib/debug.js'
import { buildRaceActs } from './raceRecipe.js'
import { createKit } from './raceStageKit.js'
import { sprintStages } from './raceStagesSprint.js'
import { catchStages, passBByVoice } from './raceStagesCatch.js'
import { climbStages } from './raceStagesClimb.js'
import { descentStages } from './raceStagesDescent.js'
import { PLATE_HOLD_MS } from './raceOpening.js'
import { SWITCH_MS } from './raceSwitch.js'
import { readTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'
import { ruReady } from './raceRu.js'

const ROUNDS = { sprint: sprintStages, catch: catchStages, climb: climbStages, descent: descentStages }

/** → { recipe, stages, chunkMs, chunkCurves, lanes, clipMode } — как buildStages (wordLaneStages.js) */
export function buildRaceStages({ plan, rate = 1, lib = () => null, tap = readTapMode(), ru = ruReady() }) {
  const kit = createKit({ plan, rate, lib })
  const { acts } = buildRaceActs(plan)
  const byVoice = passBByVoice({ tap, ready: ru }) // проход B слушает русская модель (иначе тап по трём пилюлям, без переключения слуха)
  let russian = false // слух сейчас русский: перед «Вершиной» (английские слова) его надо вернуть
  for (const act of acts) {
    if (act.id === 'climb' && russian) kit.push({ type: 'announce', act: 'climb', sid: 'climb-sw', switchTo: 'en', round: { kind: 'switch', title: 'Секунду', task: 'переключаю слух', brief: 'переключаю слух' }, ms: SWITCH_MS, line: null })
    if (act.id === 'catch') { catchStages(kit, act, { tap, ready: ru }); russian = byVoice; if (!byVoice) pLog(`[race] проход B на тапе (три пилюли): ${tap ? 'выбрано «Тапаю», русская модель не нужна' : 'русской модели Vosk нет в кэше телефона (скачать: Админ, Голос, «Встряхни память»)'}`) }
    else if (ROUNDS[act.id]) ROUNDS[act.id](kit, act)
    else kit.push({ type: 'summary', act: 'summary', sid: 'summary', line: null }) // итог: реплику говорит директор (useRaceActs): золото или обычная
  }
  const first = kit.stages[0]
  if (first?.type === 'announce') Object.assign(first, { count: 'after', soft: true, charge: true, pause: PLATE_HOLD_MS }) // старт: бар заставки САМ становится плашкой этапа (charge: отдельной плашки нет, raceOpening.js), плашка держится PLATE_HOLD_MS после речи Пита; потом три нежные ноты (шаг 600 мс, нота 1,1 с), первая пилюля — после них
  const { chunks } = plan
  const r = kit.rate
  return { recipe: { chunks, rounds: [], acts, plan }, stages: kit.stages, chunkMs: chunks.map((c, i) => (lib(i)?.ms ?? estChunkMs(c)) / r), chunkCurves: chunks.map(() => null), lanes: orderLanes(chunks.length, rngFor(plan.seed, 'lanes')), clipMode: () => false }
}
