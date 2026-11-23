import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildRaceStages } from './raceStages.js'
import { withPhrases } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { STAGES_ROUND, PINGPONG_ROUND } from './raceOnly.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Эталон «паузы по умолчанию не изменились» (CONCEPT_TIMELINE.md, шаг 2): список стадий полной гонки и режимов стенда, голосом и тапом, снят ДО того, как паузы стали настройками
// (v3.3.349), и лежит в raceStagesBaseline.fixture.json. Без переопределений (shared/lib/scenePauses.js) сборка стадий обязана давать ровно его.
// Пересъём (только когда сценарий меняют намеренно): PAUSE_SNAP=write npx vitest run src/features/pitrace/raceStagesBaseline.test.js
const FILE = new URL('./raceStagesBaseline.fixture.json', import.meta.url)
const plan = (o = {}) => withPhrases(normalizePlan({ ...fixturePlan('three'), source: 'node', game: 'race', ...o }), { phrases: PHRASE_FIXTURE, ...o })
const nul = v => v ?? null
const stageRows = stages => stages.map(s => [s.sid, s.type, nul(s.ms), nul(s.pause), nul(s.count), nul(s.waitCap), nul(s.line), nul(s.lineTail), nul(s.step?.preGap), nul(s.step?.claimGap)])
const CASES = [['full', undefined], [STAGES_ROUND, STAGES_ROUND], [PINGPONG_ROUND, PINGPONG_ROUND]].flatMap(([name, round]) => [false, true].map(tap => ({ name: `${name}/${tap ? 'tap' : 'voice'}`, round, tap })))
const snap = () => Object.fromEntries(CASES.map(c => [c.name, stageRows(buildRaceStages({ plan: plan(c.round ? { round: c.round } : {}), tap: c.tap, ru: true }).stages)]))

describe('стадии гонки без переопределений пауз — как до настроек', () => {
  if (globalThis.process?.env?.PAUSE_SNAP === 'write') writeFileSync(FILE, `{\n${Object.entries(snap()).map(([k, rows]) => `${JSON.stringify(k)}: ${JSON.stringify(rows)}`).join(',\n')}\n}\n`)
  const want = JSON.parse(readFileSync(FILE, 'utf8'))
  const got = snap()
  for (const c of CASES) it(`${c.name}: sid, тип, ms, pause, count, waitCap, реплика, lineTail, preGap, claimGap`, () => { expect(got[c.name].length).toBeGreaterThan(5); expect(got[c.name]).toEqual(want[c.name]) })
})
