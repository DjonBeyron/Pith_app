// Расписание открытия «Гонки с Питом» (CONCEPT_RACE.md, «Заставка → плашка»): Пит говорит race_start и реплику первого этапа (race_sprint), а слова летят в бар ВСЁ это время; когда бар заполнен (последнее слово
// долетело), он САМ превращается в плашку этапа «Разгон + задание» (морф за MORPH_MS — на последних ~600 мс речи), плашка держится PLATE_HOLD_MS (1,2 с) после конца речи, затем три нежные ноты и первая пилюля.
// v3.3.366: стартовая фраза кончается «…запускаю конвейер слов» — плашка этапа появляется на слове «запускаю» (LAUNCH_WORD), и к этому же моменту бар заряжен (слова летят до него); слова в реплике нет — как раньше.
// Отдельной плашки announce у первого этапа нет (стадия помечена charge, raceStages.js) — иначе плашек было бы две. Чистая функция: время от начала часов игры (после ответа на попап и готовности звука): drop → lanes → стадия 0.
// Раскладка стадии 0 берётся из того же stageTiming, что и у директора (useRehearsalActs.timingOf), поэтому плашка и ноты не расходятся с речью.
import { lineMs, LINE_PAUSE_MS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { DROP_MS, LANES_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { stageTiming, countdownPlan } from '../rehearsal/rehearsalCountdown.js'
import { fillLine } from '../rehearsal/rehearsalLines.js'
import { lineVoiced } from '../rehearsal/rehearsalQuiet.js'
import { buildRaceActs } from './raceRecipe.js'
import { readTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'
import { raceFirstLines, raceHasStart, raceSoleStart } from './raceTexts.js'
import { RACE_START_LEAD_MS } from './raceStartTrace.js'
import { pauseMs } from '../../shared/lib/scenePauses.js'
import { silentPause } from './raceSilentLine.js'
import { wordAtMs, hasWord } from './raceLineWord.js'

export const MORPH_MS = 600        // бар → плашка: последние ~600 мс речи Пита
export const PLATE_HOLD_MS = 700   // плашка держится столько после конца речи, потом три ноты
export const OPEN_FALLBACK_MS = 4000 // реплик нет вообще (не озвучены) — слова летят столько
export const LAUNCH_WORD = 'запуска' // стартовая фраза «…запускаю конвейер слов»: на этом слове бар уже заряжен и появляется плашка этапа (владелец 2026-11-25); срок — по таймингам слов записи, без них — по месту слова в тексте (raceLineWord.wordAtMs)
export const LEAD_MS = 250         // реплика Пита — через столько после начала сцены / стадии (useRehearsalActs.LINE_AT_MS)

/** Реплика, которая звучит сразу со стартом часов вместо стартовой фразы: у одиночного раунда без неё (Вершина, Спуск, Проход B) — реплика первой стадии (её объявление); иначе null (v3.3.131: у полной гонки, «Пинг-понг + финал» и «Прохода A» первой звучит race_start / race_start_tap).
 *  Раньше она ждала падения фразы и дорожек (DROP_MS + LANES_MS) и LEAD_MS — 2,1 с тишины после входа в игру. Директор (useRehearsalActs) говорит её на стадии drop, у самой стадии 0 реплики уже нет */
export const earlyStageLine = (plan, stages) => (plan?.game === 'race' && raceSoleStart(plan) && stages?.[0]?.line ? stages[0].line : null)

/**
 * → { startMs, firstMs, early (реплика этапа звучит сразу — нет вступления), stageAt (начало стадии 0), lineAt (мс от начала стадии), plateAt (плашка этапа — на слове «запускаю» стартовой фразы, LAUNCH_WORD; слова в реплике нет — с началом речи об этапе), speechEnd, morphAt (бар заполнен, начинается морф), plateEnd (плашка уходит), countAt (первая нота), pause (stage.pause) }
 * Всё в мс от начала часов игры. lines — настройки реплик (озвучка и длины), rate — скорость голоса урока, tap — режим «Пальцами» (стартовая фраза race_start_tap).
 */
export function openingPlan(plan, lines = null, rate = 1, tap = readTapMode()) {
  const HOLD = pauseMs('plate.hold'), LEAD = pauseMs('line.at') // настройки (по умолчанию PLATE_HOLD_MS и LEAD_MS) — те же значения, что запеклись в стадию 0 (raceStagePauses.js) и у директора
  const ids = raceFirstLines(plan, buildRaceActs(plan, tap).acts, tap) // стартовая фраза режима (race_start / race_start_tap) и реплика первого этапа, если она есть
  const hasStart = raceHasStart(plan), startId = hasStart ? ids[0] : null, firstId = hasStart ? ids[1] : ids[0]
  const ms = id => (id ? lineMs(fillLine(lines?.[id]), rate) : 0) // как у директора (useRehearsalActs.timingOf): длина озвучки, у неозвученной реплики — оценка по тексту (подпись и рот идут столько же)
  const startMs = ms(startId), firstMs = ms(firstId)
  if (!startMs && !firstMs) return { startMs, firstMs, early: false, stageAt: DROP_MS + LANES_MS, lineAt: 0, plateAt: DROP_MS + LANES_MS, speechEnd: OPEN_FALLBACK_MS, morphAt: OPEN_FALLBACK_MS - MORPH_MS, plateEnd: OPEN_FALLBACK_MS + HOLD, countAt: OPEN_FALLBACK_MS + HOLD, pause: HOLD }
  const stageAt = DROP_MS + LANES_MS
  if (!firstId || raceSoleStart(plan)) { // одна реплика на старте (стартовая фраза режима или реплика одиночного раунда, earlyStageLine) звучит сразу, с паузой стадии после неё; стадия 0 только ждёт, пока Пит договорит, и ведёт ноты
    const soleMs = hasStart ? startMs : firstMs, speechEnd = RACE_START_LEAD_MS + soleMs, busyMs = Math.max(0, speechEnd + silentPause(lines?.[hasStart ? startId : firstId], HOLD) - stageAt) // неозвученная — пауза CAPTION_READ_MS (как у useCatLines)
    const t = stageTiming({ order: 'after', lead: LEAD, busyMs, lineMs: 0, pause: HOLD, minMs: 0, hasLine: false, quiet: false, plan: countdownPlan({ soft: true }) })
    const countAt = stageAt + (t.countAt ?? 0)
    const tail = Math.max(1000, speechEnd - MORPH_MS), startLine = hasStart ? lines?.[startId] : null
    const launch = hasWord(startLine, LAUNCH_WORD) ? RACE_START_LEAD_MS + wordAtMs(startLine, startMs, LAUNCH_WORD) : null // «запускаю»: до этого слова плашки нет, слова заряжают бар; на нём бар полон и выскакивает плашка
    return { startMs, firstMs, early: true, stageAt, lineAt: 0, plateAt: launch ?? RACE_START_LEAD_MS, speechEnd, morphAt: launch == null ? tail : Math.max(1000, Math.min(tail, launch)), plateEnd: countAt, countAt, pause: HOLD }
  }
  const busyMs = startMs ? Math.max(0, RACE_START_LEAD_MS + startMs + silentPause(lines?.[startId], LINE_PAUSE_MS) - stageAt) : 0 // race_start начинается через RACE_START_LEAD_MS (сразу) и занимает Пита ещё на паузу после реплики
  const t = stageTiming({ order: 'after', lead: LEAD, busyMs, lineMs: firstMs, pause: HOLD, minMs: 0, hasLine: !!firstId, quiet: lineVoiced(lines, firstId), plan: countdownPlan({ soft: true }) })
  const speechEnd = Math.max(stageAt + (t.lineAt ?? 0) + firstMs, startMs ? RACE_START_LEAD_MS + startMs : 0) // Пит уже наверху (голова не выскакивает заново): звук идёт сразу
  return { startMs, firstMs, early: false, stageAt, lineAt: t.lineAt ?? 0, plateAt: stageAt + (t.lineAt ?? 0), speechEnd, morphAt: Math.max(1000, speechEnd - MORPH_MS), plateEnd: speechEnd + HOLD, countAt: stageAt + (t.countAt ?? 0), pause: HOLD }
}
