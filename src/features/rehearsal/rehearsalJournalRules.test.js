import { describe, it, expect } from 'vitest'
import { buildRehearsalStages } from './rehearsalStages.js'
import { createJournal, record, shouldRun, nextRunnable, weakLanes, missesIn } from './rehearsalJournal.js'
import { fixturePlan } from './rehearsalFixtures.js'

// Журнал актов и правила пропуска на стадиях репетиции (повтор ступени сборки, сокращение «без текста», слабые слова): стадии — rehearsalStages.test.js
const build = id => buildRehearsalStages({ plan: { ...fixturePlan(id), seed: 'd' }, rate: 1, lib: () => null })

describe('журнал и правила пропуска', () => {
  const { stages } = build('three')
  const st = sid => stages.find(s => s.sid === sid)
  it('ступень повторяется, только если у неё был промах (один раз)', () => {
    const j = createJournal()
    expect(shouldRun(st('build-0r'), j)).toBe(false)
    record(j, st('build-0'), 'fail')
    expect(shouldRun(st('build-0r'), j)).toBe(true); expect(shouldRun(st('build-1r'), j)).toBe(false)
    expect(nextRunnable(stages, st('build-0').idx + 1, j)).toBe(st('build-0r-d').idx)
    const clean = createJournal(); record(clean, st('build-0'), 'win')
    expect(nextRunnable(stages, st('build-0').idx + 1, clean)).toBe(st('build-1-d').idx) // повтор пропущен
  })
  it('промахов ≥ 3 к акту «без текста»: второй проход пропускается, «Различи» (теперь до сборки) и зеркало остаются', () => {
    const j = createJournal()
    record(j, st('warmup-0'), 'miss'); record(j, st('read-s'), 'fail'); record(j, st('build-0'), 'miss')
    expect(missesIn(j)).toBe(3)
    expect(shouldRun(st('blind-0'), j)).toBe(true); expect(shouldRun(st('blind-1'), j)).toBe(false)
    expect(shouldRun(st('discern-0-ann'), j)).toBe(true); expect(shouldRun(st('discern-0'), j)).toBe(true); expect(shouldRun(st('discern-say-0'), j)).toBe(true)
    expect(nextRunnable(stages, st('blind-0').idx + 1, j)).toBe(st('take-ann').idx)
    expect(shouldRun(st('mirror'), j)).toBe(true)
  })
  it('промахов мало — идут оба прохода и «Различи»; промахи самого акта 4 не в счёт', () => {
    const j = createJournal()
    record(j, st('warmup-0'), 'miss'); record(j, st('blind-0'), 'fail'); record(j, st('blind-0'), 'fail'); record(j, st('blind-0'), 'fail')
    expect(shouldRun(st('blind-1'), j)).toBe(true); expect(shouldRun(st('discern-0'), j)).toBe(true)
  })
  it('слово разминки, не давшееся дважды, — слабая дорожка (в «без текста» у неё подпись)', () => {
    const j = createJournal()
    record(j, st('warmup-1'), 'fail'); expect(weakLanes(j, stages)).toEqual([])
    record(j, st('warmup-1'), 'miss'); expect(weakLanes(j, stages)).toEqual([2])
  })
  it('мусор в журнал не попадает', () => {
    const j = createJournal()
    record(j, null, 'win'); record(j, st('take'), 'bogus')
    expect(j.stages).toEqual({})
  })
})
