// Расписание открытия «Гонки с Питом» (CONCEPT_RACE.md, «Заставка → плашка»): Пит говорит race_start и реплику первого этапа (race_sprint), а слова летят в бар ВСЁ это время; когда бар заполнен (последнее слово
// долетело), он САМ превращается в плашку этапа «Разгон + задание» (морф за MORPH_MS — на последних ~600 мс речи), плашка держится PLATE_HOLD_MS (1,2 с) после конца речи, затем три нежные ноты и первая пилюля.
// Отдельной плашки announce у первого этапа нет (стадия помечена charge, raceStages.js) — иначе плашек было бы две. Чистая функция: время от начала часов игры (после ответа на попап и готовности звука): drop → lanes → стадия 0.
// Раскладка стадии 0 берётся из того же stageTiming, что и у директора (useRehearsalActs.timingOf), поэтому плашка и ноты не расходятся с речью.
import { lineMs, LINE_PAUSE_MS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { DROP_MS, LANES_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { stageTiming, countdownPlan } from '../rehearsal/rehearsalCountdown.js'
import { fillLine } from '../rehearsal/rehearsalLines.js'
import { lineVoiced } from '../rehearsal/rehearsalQuiet.js'
import { buildRaceActs } from './raceRecipe.js'
import { readTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'
import { raceFirstLines, raceHasStart } from './raceTexts.js'
import { RACE_START_LEAD_MS } from './raceStartTrace.js'

export const MORPH_MS = 600        // бар → плашка: последние ~600 мс речи Пита
export const PLATE_HOLD_MS = 1200  // плашка держится столько после конца речи, потом три ноты
export const OPEN_FALLBACK_MS = 4000 // реплик нет вообще (не озвучены) — слова летят столько
export const LEAD_MS = 250         // реплика Пита — через столько после начала сцены / стадии (useRehearsalActs.LINE_AT_MS)

/** Реплика, которая звучит сразу со стартом часов вместо стартовой фразы: у одиночного раунда без неё (Вершина, Спуск, Проход B) — реплика первой стадии (её объявление); иначе null (v3.3.131: у полной гонки, «Вспомни на слух + финал» и «Прохода A» первой звучит race_start / race_start_tap).
 *  Раньше она ждала падения фразы и дорожек (DROP_MS + LANES_MS) и LEAD_MS — 2,1 с тишины после входа в игру. Директор (useRehearsalActs) говорит её на стадии drop, у самой стадии 0 реплики уже нет */
export const earlyStageLine = (plan, stages) => (plan?.game === 'race' && plan.round && !raceHasStart(plan) && stages?.[0]?.line ? stages[0].line : null)

/**
 * → { startMs, firstMs, early (реплика этапа звучит сразу — нет вступления), stageAt (начало стадии 0), lineAt (мс от начала стадии), plateAt (плашка этапа — с началом речи о нём), speechEnd, morphAt (бар заполнен, начинается морф), plateEnd (плашка уходит), countAt (первая нота), pause (stage.pause) }
 * Всё в мс от начала часов игры. lines — настройки реплик (озвучка и длины), rate — скорость голоса урока, tap — режим «Пальцами» (стартовая фраза race_start_tap).
 */
export function openingPlan(plan, lines = null, rate = 1, tap = readTapMode()) {
  const ids = raceFirstLines(plan, buildRaceActs(plan, tap).acts, tap) // стартовая фраза режима (race_start / race_start_tap) и реплика первого этапа, если она есть
  const hasStart = raceHasStart(plan), startId = hasStart ? ids[0] : null, firstId = hasStart ? ids[1] : ids[0]
  const ms = id => (id ? lineMs(fillLine(lines?.[id]), rate) : 0) // как у директора (useRehearsalActs.timingOf): длина озвучки, у неозвученной реплики — оценка по тексту (подпись и рот идут столько же)
  const startMs = ms(startId), firstMs = ms(firstId)
  if (!startMs && !firstMs) return { startMs, firstMs, early: false, stageAt: DROP_MS + LANES_MS, lineAt: 0, plateAt: DROP_MS + LANES_MS, speechEnd: OPEN_FALLBACK_MS, morphAt: OPEN_FALLBACK_MS - MORPH_MS, plateEnd: OPEN_FALLBACK_MS + PLATE_HOLD_MS, countAt: OPEN_FALLBACK_MS + PLATE_HOLD_MS, pause: PLATE_HOLD_MS }
  const stageAt = DROP_MS + LANES_MS
  if (!firstId || (plan.round && !hasStart)) { // одна реплика на старте (стартовая фраза режима или реплика одиночного раунда, earlyStageLine) звучит сразу, с паузой стадии после неё; стадия 0 только ждёт, пока Пит договорит, и ведёт ноты
    const soleMs = hasStart ? startMs : firstMs, speechEnd = RACE_START_LEAD_MS + soleMs, busyMs = Math.max(0, speechEnd + PLATE_HOLD_MS - stageAt)
    const t = stageTiming({ order: 'after', lead: LEAD_MS, busyMs, lineMs: 0, pause: PLATE_HOLD_MS, minMs: 0, hasLine: false, quiet: false, plan: countdownPlan({ soft: true }) })
    const countAt = stageAt + (t.countAt ?? 0)
    return { startMs, firstMs, early: true, stageAt, lineAt: 0, plateAt: RACE_START_LEAD_MS, speechEnd, morphAt: Math.max(1000, speechEnd - MORPH_MS), plateEnd: countAt, countAt, pause: PLATE_HOLD_MS }
  }
  const busyMs = startMs ? Math.max(0, RACE_START_LEAD_MS + startMs + LINE_PAUSE_MS - stageAt) : 0 // race_start начинается через RACE_START_LEAD_MS (сразу) и занимает Пита ещё на паузу после реплики
  const t = stageTiming({ order: 'after', lead: LEAD_MS, busyMs, lineMs: firstMs, pause: PLATE_HOLD_MS, minMs: 0, hasLine: !!firstId, quiet: lineVoiced(lines, firstId), plan: countdownPlan({ soft: true }) })
  const speechEnd = Math.max(stageAt + (t.lineAt ?? 0) + firstMs, startMs ? RACE_START_LEAD_MS + startMs : 0) // Пит уже наверху (голова не выскакивает заново): звук идёт сразу
  return { startMs, firstMs, early: false, stageAt, lineAt: t.lineAt ?? 0, plateAt: stageAt + (t.lineAt ?? 0), speechEnd, morphAt: Math.max(1000, speechEnd - MORPH_MS), plateEnd: speechEnd + PLATE_HOLD_MS, countAt: stageAt + (t.countAt ?? 0), pause: PLATE_HOLD_MS }
}
