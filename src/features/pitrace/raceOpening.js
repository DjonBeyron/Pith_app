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
import { raceFirstLines } from './raceTexts.js'
import { RACE_START_LEAD_MS } from './raceStartTrace.js'

export const MORPH_MS = 600        // бар → плашка: последние ~600 мс речи Пита
export const PLATE_HOLD_MS = 1200  // плашка держится столько после конца речи, потом три ноты
export const OPEN_FALLBACK_MS = 4000 // реплик нет вообще (не озвучены) — слова летят столько
export const LEAD_MS = 250         // реплика Пита — через столько после начала сцены / стадии (useRehearsalActs.LINE_AT_MS)

/**
 * → { startMs, firstMs, stageAt (начало стадии 0), lineAt (мс от начала стадии), speechEnd, morphAt (бар заполнен, начинается морф), plateEnd (плашка уходит), countAt (первая нота), pause (stage.pause) }
 * Всё в мс от начала часов игры. lines — настройки реплик (озвучка и длины), rate — скорость голоса урока.
 */
export function openingPlan(plan, lines = null, rate = 1) {
  const ids = raceFirstLines(plan, buildRaceActs(plan).acts) // race_start (в полной гонке) и реплика первого этапа
  const startId = plan.round ? null : ids[0], firstId = plan.round ? ids[0] : ids[1]
  const ms = id => (id ? lineMs(fillLine(lines?.[id]), rate) : 0) // как у директора (useRehearsalActs.timingOf): длина озвучки, у неозвученной реплики — оценка по тексту (подпись и рот идут столько же)
  const startMs = ms(startId), firstMs = ms(firstId)
  if (!startMs && !firstMs) return { startMs, firstMs, stageAt: DROP_MS + LANES_MS, lineAt: 0, speechEnd: OPEN_FALLBACK_MS, morphAt: OPEN_FALLBACK_MS - MORPH_MS, plateEnd: OPEN_FALLBACK_MS + PLATE_HOLD_MS, countAt: OPEN_FALLBACK_MS + PLATE_HOLD_MS, pause: PLATE_HOLD_MS }
  const stageAt = DROP_MS + LANES_MS
  const busyMs = startMs ? Math.max(0, RACE_START_LEAD_MS + startMs + LINE_PAUSE_MS - stageAt) : 0 // race_start начинается через RACE_START_LEAD_MS (сразу) и занимает Пита ещё на паузу после реплики
  const t = stageTiming({ order: 'after', lead: LEAD_MS, busyMs, lineMs: firstMs, pause: PLATE_HOLD_MS, minMs: 0, hasLine: !!firstId, quiet: lineVoiced(lines, firstId), plan: countdownPlan({ soft: true }) })
  const speechEnd = Math.max(stageAt + (t.lineAt ?? 0) + firstMs, startMs ? RACE_START_LEAD_MS + startMs : 0) // Пит уже наверху (голова не выскакивает заново): звук идёт сразу
  return { startMs, firstMs, stageAt, lineAt: t.lineAt ?? 0, speechEnd, morphAt: Math.max(1000, speechEnd - MORPH_MS), plateEnd: speechEnd + PLATE_HOLD_MS, countAt: stageAt + (t.countAt ?? 0), pause: PLATE_HOLD_MS }
}
