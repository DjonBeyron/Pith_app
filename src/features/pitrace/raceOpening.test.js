import { RACE_START_LEAD_MS } from './raceStartTrace.js'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { openingPlan, earlyStageLine, MORPH_MS, PLATE_HOLD_MS, LEAD_MS } from './raceOpening.js'
import { chargePlan } from './raceCharge.js'
import { buildRaceStages } from './raceStages.js'
import { stageTiming, countdownPlan } from '../rehearsal/rehearsalCountdown.js'
import { DROP_MS, LANES_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

// Открытие гонки: слова заставки летят ДО плашки этапа и «в плашку» — бар заполняется словами и сам превращается в плашку «Разгон + задание» (CONCEPT_RACE.md). Расписание: Пит говорит race_start и race_sprint, слова летят на всё это
// время, морф — на последних ~600 мс речи, плашка держится ~1,2 с после речи, затем три нежные ноты и первая пилюля.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const mk = (extra = {}) => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race', ...extra }); return { ...p, extraWords: extrasOf(p) } }
const lines = { race_start: { text: 'Три заезда', url: 'u1', duration: 5 }, race_sprint: { text: 'Разгон', url: 'u2', duration: 6 } }

describe('расписание открытия: слова → бар → плашка → ноты', () => {
  it('константы: морф 600 мс, плашка 1,2 с после речи', () => { expect([MORPH_MS, PLATE_HOLD_MS, LEAD_MS]).toEqual([600, 1200, 250]) })
  it('речь Пита: стартовая фраза режима сразу (RACE_START_LEAD_MS), объявления этапа A после неё нет; конец речи, морф за 600 мс до него, плашка этапа — с началом речи', () => {
    const o = openingPlan(mk(), lines)
    expect(o.startMs).toBe(5000); expect(o.firstMs).toBe(0); expect(o.early).toBe(true); expect(o.stageAt).toBe(DROP_MS + LANES_MS)
    expect(o.speechEnd).toBe(RACE_START_LEAD_MS + 5000); expect(o.plateAt).toBe(RACE_START_LEAD_MS); expect(o.lineAt).toBe(0)
    expect(o.morphAt).toBe(o.speechEnd - MORPH_MS)
  })
  it('режим пальцами: первой звучит race_start_tap, длина берётся из неё', () => {
    const tapLines = { race_start_tap: { text: 'Ловим', url: 'u4', duration: 3 }, race_start: lines.race_start }
    const o = openingPlan(mk(), tapLines, 1, true)
    expect(o.startMs).toBe(3000); expect(o.speechEnd).toBe(RACE_START_LEAD_MS + 3000)
  })
  it('ноты — ровно через 1,2 с после конца речи (директор: пауза стадии после фразы), первая пилюля — после трёх нежных нот', () => {
    const o = openingPlan(mk(), lines)
    expect(o.plateEnd).toBe(o.countAt); expect(o.pause).toBe(PLATE_HOLD_MS)
    const first = buildRaceStages({ plan: mk(), rate: 1 }).stages[0]
    expect(first).toMatchObject({ type: 'announce', charge: true, count: 'after', soft: true, pause: PLATE_HOLD_MS, line: null }) // своей реплики у этапа A нет
    const busy = Math.max(0, o.speechEnd + PLATE_HOLD_MS - o.stageAt) // sayLine со стартовой фразой держит Пита занятым на речь и паузу стадии
    const t = stageTiming({ order: 'after', lead: LEAD_MS, busyMs: busy, lineMs: 0, pause: first.pause, minMs: first.ms, hasLine: false, quiet: false, plan: countdownPlan({ soft: true }) })
    expect(o.stageAt + t.countAt).toBe(o.countAt); expect(t.holdMs).toBeGreaterThanOrEqual(t.countAt + 1100) // стадия держится до конца третьей ноты
  })
  it('слова летят до морфа: последняя пилюля прилетает ровно в morphAt, сегменты бара заполнены к началу морфа', () => {
    const o = openingPlan(mk(), lines), { pills, segments, totalMs } = chargePlan(mk(), o.morphAt)
    expect(totalMs).toBe(o.morphAt); expect(pills.at(-1).arriveAt).toBe(o.morphAt); expect(segments.at(-1).at).toBe(o.morphAt); expect(segments.at(-1).to).toBe(100)
    expect(o.morphAt + MORPH_MS).toBe(o.speechEnd) // морф укладывается в последние 600 мс речи
  })
  it('реплик нет вовсе — слова летят 4 с; у прохода B первой (без прохода A) после стартовой идёт его реплика', () => {
    const none = openingPlan(mk(), null)
    expect(none.speechEnd).toBe(4000); expect(none.morphAt).toBe(3400); expect(none.plateEnd).toBe(5200)
  })
  it('«Пинг-понг + финал» и «Проход A»: тоже стартовая фраза (раньше — реплика этапа); одиночные Вершина и Спуск, проход B — вступления нет, реплика этапа звучит СРАЗУ со стартом часов', () => {
    const st = openingPlan(mk({ round: 'stages' }), lines)
    expect(st.startMs).toBe(5000); expect(st.early).toBe(true); expect(st.speechEnd).toBe(RACE_START_LEAD_MS + 5000)
    for (const round of ['stages', 'sprint']) { const p = mk({ round }), { stages } = buildRaceStages({ plan: p, rate: 1 }); expect(earlyStageLine(p, stages)).toBeNull() }
    const o = openingPlan(mk({ round: 'catch' }), { race_catch_tap: { text: 'Лови', url: 'u3', duration: 4 }, race_start: lines.race_start })
    expect(o.startMs).toBe(0); expect(o.firstMs).toBe(4000); expect(o.early).toBe(true)
    expect(o.speechEnd).toBe(RACE_START_LEAD_MS + 4000); expect(o.plateAt).toBe(RACE_START_LEAD_MS); expect(o.speechEnd).toBeLessThan(o.stageAt + LEAD_MS + 4000)
    const busy = Math.max(0, o.speechEnd + PLATE_HOLD_MS - o.stageAt) // директор: busyLeft на входе в стадию 0 — реплика сказана на старте с паузой стадии
    expect(o.countAt).toBe(o.stageAt + LEAD_MS + busy); expect(o.plateEnd).toBe(o.countAt); expect(o.morphAt).toBe(o.speechEnd - MORPH_MS)
    for (const round of ['climb', 'descent', 'catch']) { const p = mk({ round }), { stages } = buildRaceStages({ plan: p, rate: 1 }); expect(earlyStageLine(p, stages)).toBe(stages[0].line); expect(stages[0].line).toBeTruthy() }
    expect(earlyStageLine(mk(), buildRaceStages({ plan: mk(), rate: 1 }).stages)).toBeNull() // полная гонка: сразу звучит стартовая фраза
  })
  it('директор: реплика первой стадии без вступления — на стадии drop (как race_start), у стадии 0 своей реплики уже нет', () => {
    const src = read('../rehearsal/useRehearsalActs.js')
    expect(src).toContain('earlyStageLine(plan, stages)'); expect(src).toContain("const lineOf = st => (early && st?.idx === 0 ? null : st?.line ?? null)")
    expect(src).toContain('sayLine(intro ? startLine : early, null, race ? { noRise: true'); expect(src).toContain('...(intro && stages[0]?.line ? {} : { pause: stages[0]?.pause ?? LINE_PAUSE_MS })')
    expect(src).not.toMatch(/running\.line\b/) // все места читают реплику стадии через lineOf
  })
  it('нет Math.random; у первой стадии отдельной плашки нет (charge → plate пустая); морф — в RaceChargePlate, а не отдельная плашка announce', () => {
    for (const f of ['./raceOpening.js', './RaceChargePlate.jsx', './RaceCharge.jsx', './RaceChargeRun.jsx']) expect(read(f)).not.toContain('Math.random')
    expect(read('../player/modules/rotate-phone/useWordLaneFlow.js')).toContain("const plate = !rh.plateOk || stageObj?.charge ? ''")
    expect(read('../rehearsal/useRehearsalActs.js')).toContain('pause: st.pause ?? LINE_PAUSE_MS')
    const rc = read('./RaceCharge.jsx'), run = read('./RaceChargeRun.jsx')
    expect(rc).toContain('openingPlan('); expect(rc).toContain('chargePlan(plan, o.morphAt, openingWords(a))'); expect(run).toContain('<RaceChargePlate'); expect(run).toContain('at(o.plateAt ?? o.morphAt, () => setShown(true))'); expect(run).toContain('at(o.plateEnd, () => setDone(true))')
  })
})
