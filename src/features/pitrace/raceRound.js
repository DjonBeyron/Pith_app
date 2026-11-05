// Зарядка бара посреди игры «Гонки с Питом» (CONCEPT_RACE.md, «Бар живёт весь разгон»): чистый план без DOM и часов. Два случая, помимо начала игры (raceOpening.js, RaceCharge.jsx):
//  • 'round2' — второй круг «Разгона» / «Слушай и лови»: пока Пит говорит race_sprint_round2 (стадия sprint2-ann / catch2-ann, плашки у неё нет), бар снова заряжается словами второго круга — они летят снизу вверх, со звуком касания, без превращения в плашку;
//  • 'stage' — этап 2 («Слушай и лови», стадия catch-ann с флагом charge): пока Пит объявляет этап (race_catch), бар заряжается словами этапа 2 и САМ становится плашкой этапа (как в начале игры), плашка держится STAGE_HOLD_MS после речи.
// Время считается от начала стадии: реплика Пита начинается через LEAD_MS (+20 мс, как у директора), длиной lineMs (озвучка или оценка по тексту). Слова долетают за ~0,3 с до конца речи (круг 2) или к началу морфа (этап 2, за MORPH_MS до конца речи).
import { lineMs } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { fillLine } from '../rehearsal/rehearsalLines.js'
import { LEAD_MS, MORPH_MS, OPEN_FALLBACK_MS } from './raceOpening.js'
import { chargePlan } from './raceCharge.js'
import { chargeWordsOf } from './raceBar.js'

export const ROUND2_MIN_MS = 1200  // слова второго круга летят не короче
export const ROUND2_LAG_MS = 300   // и долетают за столько до конца речи Пита
export const STAGE_HOLD_MS = 1500  // плашка этапа 2 держится столько после конца речи

/** Какая зарядка у стадии i: 'round2' (объявление второго круга), 'stage' (объявление этапа 2 с флагом charge, не первая стадия) или null */
export function roundKind(stages, i) {
  const s = stages?.[i]
  if (s?.type !== 'announce' || !chargeWordsOf(stages, i).length) return null
  if (/2-ann$/.test(s.sid ?? '')) return 'round2'
  return s.charge && i > 0 ? 'stage' : null
}

/**
 * План зарядки стадии i: → { kind, o: { morphAt, plateEnd }, round: { title, task }, pills, sparks, segments, totalMs } или null (стадия без зарядки).
 * plan — план гонки (семя), lines — реплики Пита (длины), rate — скорость голоса.
 */
export function roundPlan({ plan, stages, i, lines = null, rate = 1 }) {
  const kind = roundKind(stages, i)
  if (!kind) return null
  const stage = stages[i], words = chargeWordsOf(stages, i)
  const len = stage.line ? lineMs(fillLine(lines?.[stage.line]), rate) : 0
  const speechEnd = len ? LEAD_MS + 20 + len : OPEN_FALLBACK_MS
  const tag = `race-charge-${stage.sid}`
  if (kind === 'round2') return { kind, o: { morphAt: Infinity, plateEnd: Infinity }, round: { title: '', task: '' }, ...chargePlan(plan, Math.max(ROUND2_MIN_MS, speechEnd - ROUND2_LAG_MS), words, tag) }
  const morphAt = Math.max(1000, speechEnd - MORPH_MS)
  return { kind, o: { morphAt, plateEnd: speechEnd + STAGE_HOLD_MS }, round: { title: stage.round?.title ?? '', task: stage.round?.task ?? '' }, ...chargePlan(plan, morphAt, words, tag) }
}
