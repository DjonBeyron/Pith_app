import { RACE_START_LEAD_MS } from './raceStartTrace.js'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { openingPlan, MORPH_MS, PLATE_HOLD_MS, LEAD_MS } from './raceOpening.js'
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
  it('речь Пита: race_start сразу (RACE_START_LEAD_MS), реплика этапа — в стадии 0 после него; конец речи, морф за 600 мс до него, плашка уходит через 1,2 с после речи', () => {
    const o = openingPlan(mk(), lines)
    expect(o.startMs).toBe(5000); expect(o.firstMs).toBe(6000); expect(o.stageAt).toBe(DROP_MS + LANES_MS)
    const busy = Math.max(0, RACE_START_LEAD_MS + 5000 + 600 - o.stageAt) // Пит ещё занят race_start на входе в стадию 0
    expect(o.lineAt).toBe(LEAD_MS + busy + 20)
    expect(o.speechEnd).toBe(o.stageAt + o.lineAt + 6000)
    expect(o.morphAt).toBe(o.speechEnd - MORPH_MS); expect(o.plateEnd).toBe(o.speechEnd + PLATE_HOLD_MS)
  })
  it('ноты — ровно через 1,2 с после конца речи (директор: stage.pause = PLATE_HOLD_MS), первая пилюля — после трёх нежных нот', () => {
    const o = openingPlan(mk(), lines)
    expect(o.countAt).toBe(o.speechEnd + PLATE_HOLD_MS); expect(o.pause).toBe(PLATE_HOLD_MS)
    const first = buildRaceStages({ plan: mk(), rate: 1 }).stages[0]
    expect(first).toMatchObject({ type: 'announce', charge: true, count: 'after', soft: true, pause: PLATE_HOLD_MS, line: 'race_sprint' })
    const t = stageTiming({ order: 'after', lead: LEAD_MS, busyMs: Math.max(0, RACE_START_LEAD_MS + 5000 + 600 - o.stageAt), lineMs: 6000, pause: first.pause, minMs: first.ms, hasLine: true, quiet: true, plan: countdownPlan({ soft: true }) })
    expect(o.stageAt + t.countAt).toBe(o.countAt); expect(t.holdMs).toBeGreaterThanOrEqual(t.countAt + 1200 + 1100) // стадия держится до конца третьей ноты
  })
  it('слова летят до морфа: последняя пилюля прилетает ровно в morphAt, сегменты бара заполнены к началу морфа', () => {
    const o = openingPlan(mk(), lines), { pills, segments, totalMs } = chargePlan(mk(), o.morphAt)
    expect(totalMs).toBe(o.morphAt); expect(pills.at(-1).arriveAt).toBe(o.morphAt); expect(segments.at(-1).at).toBe(o.morphAt); expect(segments.at(-1).to).toBe(100)
    expect(o.morphAt + MORPH_MS).toBe(o.speechEnd) // морф укладывается в последние 600 мс речи
  })
  it('короткий race_start: Пит не занят на входе в стадию 0 — реплика этапа сразу после LEAD; реплик нет вовсе — слова летят 4 с', () => {
    const o = openingPlan(mk(), { race_start: { text: 'a', url: 'u', duration: 1 }, race_sprint: lines.race_sprint })
    expect(o.lineAt).toBe(LEAD_MS + 20); expect(o.speechEnd).toBe(o.stageAt + o.lineAt + 6000)
    const none = openingPlan(mk(), null)
    expect(none.speechEnd).toBe(4000); expect(none.morphAt).toBe(3400); expect(none.plateEnd).toBe(5200)
  })
  it('один раунд (plan.round): вступления race_start нет, плашка — раунда', () => {
    const o = openingPlan(mk({ round: 'catch' }), { race_catch: { text: 'Лови', url: 'u3', duration: 4 }, race_start: lines.race_start })
    expect(o.startMs).toBe(0); expect(o.firstMs).toBe(4000); expect(o.speechEnd).toBe(o.stageAt + o.lineAt + 4000)
  })
  it('нет Math.random; у первой стадии отдельной плашки нет (charge → plate пустая); морф — в RaceChargePlate, а не отдельная плашка announce', () => {
    for (const f of ['./raceOpening.js', './RaceChargePlate.jsx', './RaceCharge.jsx', './RaceChargeRun.jsx']) expect(read(f)).not.toContain('Math.random')
    expect(read('../player/modules/rotate-phone/useWordLaneFlow.js')).toContain("const plate = !rh.plateOk || stageObj?.charge ? ''")
    expect(read('../rehearsal/useRehearsalActs.js')).toContain('pause: st.pause ?? LINE_PAUSE_MS')
    const rc = read('./RaceCharge.jsx'), run = read('./RaceChargeRun.jsx')
    expect(rc).toContain('openingPlan('); expect(rc).toContain('chargePlan(plan, o.morphAt, openingWords(a))'); expect(run).toContain('<RaceChargePlate'); expect(run).toContain('at(o.plateAt ?? o.morphAt, () => setShown(true))'); expect(run).toContain('at(o.plateEnd, () => setDone(true))')
  })
})
