import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { upcomingLanes, previousLanes, actArmedLanes, isActStart, armedLanes, KEEP_CHAR } from './wordLaneConveyorStart.js'
import { runLanes } from './wordLaneRunLanes.js'
import { RUN_NONE } from './wordLaneRunLanes.js'
import { createConveyorDrive } from './laneConveyorDrive.js'
import { buildRehearsalStages } from '../../../rehearsal/rehearsalStages.js'
import { fixturePlan, FIXTURE_IDS } from '../../../rehearsal/rehearsalFixtures.js'

// Конвейер в актах репетиции (v3.3.101): едет дорожка, где сейчас пилюли, и та, где они будут следующими (зажигается заранее); непрерывно — лишь дорожка, на которой пилюли идут подряд (до v3.3.101 ехали все дорожки акта)
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const st = (act, type, active = []) => ({ act, type, step: { active } })
const lanesOf = str => str.split('').map((c, k) => (c === '1' ? k : -1)).filter(k => k >= 0)
const lanesOf2 = str => str.split('').map((c, k) => (c === '2' ? k : -1)).filter(k => k >= 0)

describe('upcomingLanes / previousLanes / isActStart', () => {
  const stages = [
    st('warmup', 'announce'), st('warmup', 'warmup', [1]), st('warmup', 'warmup', [0]), st('warmup', 'warmup', [2]),
    st('read', 'announce'), st('read', 'read', [0, 1, 2]), st('read', 'turn', [0, 1, 2]), st('read', 'student', [0, 1, 2]),
    { act: 'mirror', type: 'mirror' }, { act: 'summary', type: 'summary' },
  ]
  it('ближайшая следующая стадия с пилюлями в том же акте — только её дорожки, не весь акт', () => {
    expect(upcomingLanes(stages, 0)).toEqual([1])
    expect(upcomingLanes(stages, 1)).toEqual([0])
    expect(upcomingLanes(stages, 2)).toEqual([2])
    expect(upcomingLanes(stages, 3)).toEqual([])               // слов в акте больше нет
    expect(upcomingLanes(stages, 4)).toEqual([0, 1, 2])         // через плашку
    expect(upcomingLanes(stages, 7)).toEqual([])                // дальше другой акт
  })
  it('правила пропуска (nextIdx) учитываются: пропущенная стадия не зажигает дорожку', () => {
    expect(upcomingLanes(stages, 1, i => (i === 2 ? 3 : i))).toEqual([2])
  })
  it('дорожки стадии с пилюлями перед плашкой — те, по которым конвейер ехал до неё', () => {
    expect(previousLanes(stages, 6)).toEqual([0, 1, 2])
    expect(previousLanes(stages, 0)).toEqual([])
    expect(previousLanes(stages, 4)).toEqual([])                // акт начался заново
  })
  it('зеркало, итог, нет акта, конец списка — дорожек нет', () => {
    expect(upcomingLanes(stages, 8)).toEqual([])
    expect(upcomingLanes([{ type: 'announce' }], 0)).toEqual([])
    expect(upcomingLanes(stages, 99)).toEqual([])
    expect(actArmedLanes({ stages, idx: 8, ignited: true })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages, idx: 9, ignited: true })).toBe(RUN_NONE)
  })
  it('граница акта — его первая стадия; команда «держать ход» — «2», не «1»', () => {
    expect([0, 1, 3, 4, 5, 8, 9].map(i => isActStart(stages, i))).toEqual([true, false, false, true, false, true, true])
    expect(isActStart([{ type: 'announce' }], 0)).toBe(false)
    expect(KEEP_CHAR).toBe('2')
  })
})

describe('actArmedLanes: едет только дорожка, где сейчас пилюля, следующая зажигается заранее (v3.3.101)', () => {
  // разминка: слово на 1-й, потом на 3-й дорожке; потом сборка: ступени [2] → [1,2]
  const stages = [st('w', 'announce'), st('w', 'warmup', [0]), st('w', 'warmup', [2]), st('b', 'announce'), st('b', 'dictor', [2]), st('b', 'turn', [2]), st('b', 'student', [2]), st('b', 'dictor', [1, 2]), st('b', 'turn', [1, 2]), st('b', 'student', [1, 2])]
  it('разминка: слово на дорожке 1 — едет одна дорожка, на третью команды нет, пока слово не кончилось', () => {
    expect(actArmedLanes({ stages, idx: 1 })).toBe('200')
    expect(actArmedLanes({ stages, idx: 2 })).toBe('002')
  })
  it('слово закончилось (leaving): следующая дорожка зажигается заранее, прежняя переходит на «по пилюлям» и тормозит, когда они ушли', () => {
    expect(actArmedLanes({ stages, idx: 1, leaving: true })).toBe('102')
    expect(actArmedLanes({ stages, idx: 2, leaving: true })).toBe('001')   // слов дальше нет — только тормозит
  })
  it('то же слово подряд на той же дорожке — едет непрерывно, без торможения', () => {
    const same = [st('w', 'announce'), st('w', 'warmup', [1]), st('w', 'warmup', [1])]
    expect(actArmedLanes({ stages: same, idx: 1, leaving: true })).toBe('020')
  })
  it('первая плашка акта: до зажигания команды нет (дорожки прошлого акта тормозят), после — дорожка первой стадии', () => {
    expect(actArmedLanes({ stages, idx: 0 })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages, idx: 0, ignited: true })).toBe('200')
    expect(actArmedLanes({ stages, idx: 3 })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages, idx: 3, ignited: true })).toBe('002')
  })
  it('сборка: плашка «твоя очередь» между диктором и учеником на той же дорожке — не тормозит', () => {
    expect(actArmedLanes({ stages, idx: 4 })).toBe('002')
    expect(actArmedLanes({ stages, idx: 5 })).toBe('002')
    expect(actArmedLanes({ stages, idx: 6 })).toBe('002')
  })
  it('сборка, ступень [2] → [1,2]: на выходе зажигается дорожка 1, дорожка 2 идёт подряд и не тормозит; плашка перед диктором новой ступени не отключает дорожку 1', () => {
    expect(actArmedLanes({ stages, idx: 6, leaving: true })).toBe('022')
    expect(actArmedLanes({ stages, idx: 7 })).toBe('022')
    expect(actArmedLanes({ stages, idx: 8 })).toBe('022')
  })
  it('на плашке внутри акта дорожка, которой ещё не было, ждёт момента зажигания; прежняя без пилюль — «0»', () => {
    const s = [st('a', 'announce'), st('a', 'student', [0]), st('a', 'turn', [2]), st('a', 'student', [2])]
    expect(actArmedLanes({ stages: s, idx: 2 })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages: s, idx: 2, ignited: true })).toBe('002')
  })
  it('первая стадия акта — не плашка, а пилюли: её дорожки сразу', () => {
    expect(actArmedLanes({ stages: [st('x', 'student', [2]), st('x', 'student', [0])], idx: 0 })).toBe('002')
  })
  it('без акта (стадии обычной ноды) и вне списка — ни одной', () => {
    expect(actArmedLanes({ stages: [{ type: 'student', step: { active: [0] } }], idx: 0 })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages, idx: 40 })).toBe(RUN_NONE)
  })
})

describe('настоящие стадии репетиции (все фикстуры): за раз едет не больше дорожек, чем нужно', () => {
  for (const id of FIXTURE_IDS) {
    const { stages } = buildRehearsalStages({ plan: fixturePlan(id) })
    it(`фикстура ${id}: на стадии с пилюлями команда «2» только на её дорожках; на выходе — ещё и на дорожках следующей стадии акта и больше ни на каких`, () => {
      stages.forEach((s, i) => {
        const own = lanesOf(runLanes(s))
        if (!own.length) return
        const cmd = actArmedLanes({ stages, idx: i })
        expect(lanesOf2(cmd)).toEqual(own)
        const out = actArmedLanes({ stages, idx: i, leaving: true })
        const next = upcomingLanes(stages, i)
        expect(lanesOf2(out)).toEqual([...new Set([...own.filter(k => next.includes(k)), ...next])].sort())
        own.filter(k => !next.includes(k)).forEach(k => expect(out[k]).toBe('1'))
      })
    })
    it(`фикстура ${id}: разминка — между словами на разных дорожках за раз «2» стоит не больше чем на двух (текущая и зажигаемая заранее); зеркало и итог — дорожек нет`, () => {
      stages.forEach((s, i) => {
        for (const leaving of [false, true]) for (const ignited of [false, true]) expect(lanesOf2(actArmedLanes({ stages, idx: i, ignited, leaving })).length).toBeLessThanOrEqual(3)
        if (s.act === 'warmup') expect(lanesOf2(actArmedLanes({ stages, idx: i, ignited: true })).length).toBeLessThanOrEqual(1)
        if (s.type === 'mirror' || s.type === 'summary') expect(actArmedLanes({ stages, idx: i, ignited: true, leaving: true })).toBe(RUN_NONE)
      })
    })
  }
})

describe('обычная нода (без плана) — прежняя схема «по пилюлям»', () => {
  it('armedLanes не знает про акты и отдаёт «1»', () => {
    expect(armedLanes({ stageObj: { type: 'student', step: { active: [0, 2] } } })).toBe('101')
  })
  it('хук: в репетиции — actArmedLanes с leaving и правилами пропуска, без плана — armedLanes; таймер зажигания на каждой плашке', () => {
    const src = read('./useConveyorArm.js')
    expect(src).toContain('actArmedLanes({ stages, idx, ignited, leaving: leaving === idx, nextIdx: rh.nextIdx })')
    expect(src).toContain('return armedLanes({ stageObj, nextStage: stages[idx + 1] ?? null, ignited })')
    expect(src).toContain('const needTimer = plate')
    expect(read('./useWordLaneFlow.js')).toContain('setS(p => ({ ...p, leaving: at }))') // директор говорит «ступень закончена»
  })
})

// Привод на подставном DOM: команда '2' — дорожка едет без пилюль; '1' — по пилюлям
function drive() {
  const cols = [0, 1, 2].map(() => ({ props: {}, style: { setProperty(k, v) { this.owner.props[k] = v } } }))
  cols.forEach(c => { c.style.owner = c })
  let queue = [], t = 1000
  const root = { querySelectorAll: sel => (sel === '.wlLanes i' ? cols : []) }
  const d = createConveyorDrive({ root, now: () => t, raf: f => { queue.push(f); return queue.length }, caf: () => { queue = [] }, observe: () => () => {} })
  return { d, frames(ms) { for (let el = 0; el < ms && queue.length; el += 1000 / 60) { t += 1000 / 60; queue.shift()(t) } } }
}

describe('привод: команда «2» держит ход без пилюль', () => {
  it('«202»: две дорожки зажглись и едут 30 секунд без единой пилюли, средняя стоит', () => {
    const h = drive()
    h.d.setArmed('202')
    h.frames(30000)
    expect(h.d.state().phases).toEqual(['run', 'idle', 'run'])
    expect(h.d.state().keep).toEqual([true, false, true])
    expect(h.d.state().running).toBe(true)
  })
  it('команду сняли («000») — обе тормозят и засыпают; команда «1», пока пилюль не было, ждёт первую (как раньше)', () => {
    const h = drive()
    h.d.setArmed('202'); h.frames(3000)
    h.d.setArmed('000'); h.frames(2000)
    expect(h.d.state().phases).toEqual(['idle', 'idle', 'idle'])
    expect(h.d.state().running).toBe(false)
    const g = drive()
    g.d.setArmed('100'); g.frames(3000)
    expect(g.d.state().phases[0]).toBe('run')
    g.frames(1500)
    expect(g.d.state().phases[0]).toBe('run') // «1»: пилюль ещё не было — ждёт первую, пока команда стоит
  })
})
