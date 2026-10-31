import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { actLanes, actArmedLanes, isActStart, armedLanes, KEEP_CHAR } from './wordLaneConveyorStart.js'
import { RUN_NONE } from './wordLaneRunLanes.js'
import { createConveyorDrive } from './laneConveyorDrive.js'
import { buildRehearsalStages } from '../../../rehearsal/rehearsalStages.js'
import { fixturePlan, FIXTURE_IDS } from '../../../rehearsal/rehearsalFixtures.js'

// Конвейер в актах репетиции (v3.3.87): внутри акта едет непрерывно на всех дорожках акта (Пит говорит, слово переезжает на другую дорожку, стадии сменяются), тормозит только на границе акта и перед зеркалом / итогом
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const st = (act, type, active = []) => ({ act, type, step: { active } })

describe('actLanes / isActStart: дорожки акта', () => {
  const stages = [
    st('warmup', 'announce'), st('warmup', 'warmup', [1]), st('warmup', 'warmup', [0]), st('warmup', 'warmup', [2]),
    st('read', 'announce'), st('read', 'read', [0, 1, 2]), st('read', 'turn', [0, 1, 2]), st('read', 'student', [0, 1, 2]),
    { act: 'mirror', type: 'mirror' }, { act: 'summary', type: 'summary' },
  ]
  it('объединение дорожек всех стадий акта: разминка по словам на 2-й, 1-й и 3-й дорожках — все три едут весь акт', () => {
    for (const i of [0, 1, 2, 3]) expect(actLanes(stages, i)).toBe('222')
    expect(actLanes([st('a', 'announce'), st('a', 'warmup', [1]), st('a', 'warmup', [1])], 1)).toBe('020')
  })
  it('зеркало, итог, нет акта — дорожек нет', () => {
    expect(actLanes(stages, 8)).toBe(RUN_NONE)
    expect(actLanes(stages, 9)).toBe(RUN_NONE)
    expect(actLanes([{ type: 'announce' }], 0)).toBe(RUN_NONE)
    expect(actLanes(stages, 99)).toBe(RUN_NONE)
  })
  it('граница акта — его первая стадия', () => {
    expect([0, 1, 3, 4, 5, 8, 9].map(i => isActStart(stages, i))).toEqual([true, false, false, true, false, true, true])
    expect(isActStart([{ type: 'announce' }], 0)).toBe(false)
  })
  it('команда акта — «2» (держать ход), не «1» (по пилюлям)', () => {
    expect(KEEP_CHAR).toBe('2')
  })
})

describe('actArmedLanes: когда команда стоит', () => {
  const stages = [st('a', 'announce'), st('a', 'warmup', [0]), st('a', 'warmup', [2]), st('b', 'announce'), st('b', 'dictor', [1])]
  it('плашка — граница акта: до момента зажигания команды нет, после — дорожки акта', () => {
    expect(actArmedLanes({ stages, idx: 0, ignited: false })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages, idx: 0, ignited: true })).toBe('202')
    expect(actArmedLanes({ stages, idx: 3, ignited: false })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages, idx: 3, ignited: true })).toBe('020')
  })
  it('внутри акта — дорожки акта сразу, зажигание не нужно (и между словами не меняются)', () => {
    expect(actArmedLanes({ stages, idx: 1 })).toBe('202')
    expect(actArmedLanes({ stages, idx: 2 })).toBe('202')
    expect(actArmedLanes({ stages, idx: 4 })).toBe('020')
  })
  it('первая стадия акта — не плашка, а пилюли: дорожки акта сразу', () => {
    expect(actArmedLanes({ stages: [st('x', 'student', [2]), st('x', 'student', [0])], idx: 0 })).toBe('202')
  })
  it('без акта (стадии обычной ноды) и вне списка — ни одной', () => {
    expect(actArmedLanes({ stages: [{ type: 'student', step: { active: [0] } }], idx: 0 })).toBe(RUN_NONE)
    expect(actArmedLanes({ stages, idx: 40 })).toBe(RUN_NONE)
  })
})

describe('настоящие стадии репетиции (все фикстуры): команда не прерывается внутри акта', () => {
  for (const id of FIXTURE_IDS) {
    const { stages } = buildRehearsalStages({ plan: fixturePlan(id) })
    it(`фикстура ${id}: внутри акта строка одна и та же на всех стадиях, у границы акта до зажигания — пусто`, () => {
      expect(stages.length).toBeGreaterThan(3)
      stages.forEach((s, i) => {
        const full = actArmedLanes({ stages, idx: i, ignited: true })
        expect(full).toBe(actLanes(stages, i))
        const before = actArmedLanes({ stages, idx: i, ignited: false })
        if (isActStart(stages, i) && (s.type === 'announce' || s.type === 'turn')) expect(before).toBe(RUN_NONE)
        else expect(before).toBe(full)
        if (i > 0 && stages[i - 1].act === s.act) expect(actArmedLanes({ stages, idx: i })).toBe(actArmedLanes({ stages, idx: i - 1, ignited: true }))
      })
    })
    it(`фикстура ${id}: разминка — все дорожки её слов едут весь акт; зеркало и итог — дорожек нет`, () => {
      const warm = stages.map((s, i) => ({ s, i })).filter(x => x.s.act === 'warmup')
      if (warm.length) {
        const lanes = new Set(warm.filter(x => x.s.type === 'warmup').map(x => x.s.word.lane))
        const str = actArmedLanes({ stages, idx: warm.at(-1).i })
        for (const lane of lanes) expect(str[lane]).toBe(KEEP_CHAR)
        expect(new Set(warm.slice(1).map(x => actArmedLanes({ stages, idx: x.i }))).size).toBe(1) // между словами строка не меняется — конвейер не тормозит
      }
      for (const [i, s] of stages.entries()) if (s.type === 'mirror' || s.type === 'summary') expect(actArmedLanes({ stages, idx: i, ignited: true })).toBe(RUN_NONE)
    })
  }
})

describe('обычная нода (без плана) — прежняя схема «по пилюлям»', () => {
  it('armedLanes не знает про акты и отдаёт «1»', () => {
    expect(armedLanes({ stageObj: { type: 'student', step: { active: [0, 2] } } })).toBe('101')
  })
  it('хук: в репетиции — actArmedLanes, без плана — armedLanes; таймер зажигания только на границе акта', () => {
    const src = read('./useConveyorArm.js')
    expect(src).toContain('if (rh.on) return stage === \'run\' ? actArmedLanes({ stages, idx, ignited })')
    expect(src).toContain('return armedLanes({ stageObj, nextStage: stages[idx + 1] ?? null, ignited })')
    expect(src).toContain('plate && (!rh.on || isActStart(stages, idx))')
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
