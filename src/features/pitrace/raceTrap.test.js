import { describe, it, expect } from 'vitest'
import { trapOf, trapLane, trapSaid } from './raceTrap.js'
import { sayTrap } from './raceTrapVoice.js'
import { initRace, reduceRace } from './raceState.js'
import { initClimb, enter, apply } from './raceLadder.js'
import { buildRaceStages } from './raceStages.js'
import { climbWords, climbHints } from './raceWords.js'
import { laneOf } from './raceClimbCam.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const planOf = id => normalizePlan({ ...fixturePlan(id), game: 'race' })
const plan = planOf('three')
const stages = buildRaceStages({ plan }).stages
const steps = stages.filter(s => s.act === 'climb' && s.type === 'student')
const ev = (s, t, stage, info) => reduceRace(s, { t, stage, info, now: 1000 })

describe('ловушки-двойники «Вершины»: раскладка', () => {
  it('одна на подъём — на первой ступени с двойниками (learn → ступень 4); двойник из confusers слова; без двойников ловушки нет', () => {
    const traps = steps.map(s => s.trap)
    expect(new Set(traps).size).toBe(1) // у всех ступеней один и тот же объект ловушки
    expect(traps[0]).toMatchObject({ k: 4, state: 'stand', said: '' })
    expect(['earn', 'lean']).toContain(traps[0].text)
    expect(steps.map(s => s.confusers)).toEqual([[], [], [], ['earn', 'lean']])
    const none = buildRaceStages({ plan: planOf('two') }).stages.filter(s => s.act === 'climb' && s.type === 'student')
    expect(none.every(s => s.trap === null)).toBe(true)
  })
  it('дорожка ловушки — соседняя с дорожкой острова и никогда не совпадает с ней, для любого k и любого семени', () => {
    for (let k = 1; k <= 9; k++) for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const lane = trapLane(k, () => Math.abs(Math.sin(seed.charCodeAt(0) * k)))
      expect(lane).not.toBe(laneOf(k)); expect(Math.abs(lane - laneOf(k))).toBe(1)
    }
    const t = steps[0].trap
    expect(Math.abs(t.lane - laneOf(t.k))).toBe(1)
  })
  it('раскладка воспроизводима по семени и не использует Math.random', () => {
    const doubles = w => (w === 'b' ? ['x', 'y'] : [])
    const a = trapOf({ words: ['a', 'b', 'c'], doubles, seed: 's1' }), b = trapOf({ words: ['a', 'b', 'c'], doubles, seed: 's1' })
    expect(a).toEqual(b); expect(a.k).toBe(2)
    expect(trapOf({ words: ['a'], doubles: () => [], seed: 's' })).toBeNull()
  })
  it('переводы на камнях — из карточек плана; у слова без карточки пусто', () => {
    expect(climbHints(plan)).toEqual(['я', 'пытаюсь', '', 'учиться']) // «to» без карточки
    expect(climbHints(plan)).toHaveLength(climbWords(plan).length)
  })
})

describe('ловушки-двойники: что сказал человек', () => {
  it('trapSaid: двойник слова ступени → он; верное слово, чужое слово, пусто → null', () => {
    expect(trapSaid('earn', 'learn', ['earn', 'lean'])).toBe('earn')
    expect(trapSaid("i'm lean", 'learn', ['earn', 'lean'])).toBe('lean')
    expect(trapSaid('learn', 'learn', ['earn', 'lean'])).toBeNull()
    expect(trapSaid('table', 'learn', ['earn', 'lean'])).toBeNull()
    expect(trapSaid('', 'learn', ['earn'])).toBeNull(); expect(trapSaid(undefined, 'learn', ['earn'])).toBeNull()
  })
  it('двойник на ступени с ловушкой: ловушка осыпается, промах как обычно (соскок), Пит говорит про двойника (trap), а не «соскользнул»', () => {
    let s = ev(initRace(), 'enter', steps[0]).state
    for (const k of [1, 2, 3]) s = ev(ev(s, 'win', steps[k - 1]).state, 'enter', steps[k]).state // подняться на ступень 3
    const r = ev(s, 'miss', steps[3], { heard: 'earn' })
    expect(r.trap).toEqual({ said: 'earn', word: 'learn' }); expect(r.say).toBeNull(); expect(r.hint).toBeNull()
    expect(r.state.climb.trap).toMatchObject({ state: 'crumbled', said: 'earn' }); expect(r.state.climb.rung).toBe(2); expect(r.state.climb.last).toBe('slip')
    expect(r.log).toContain('ловушка')
  })
  it('верное слово на ступени с ловушкой: ловушка проваливается и прыжок на остров; потом ловушки нет', () => {
    let s = ev(initRace(), 'enter', steps[0]).state
    for (const k of [1, 2, 3]) s = ev(ev(s, 'win', steps[k - 1]).state, 'enter', steps[k]).state
    const r = ev(s, 'win', steps[3])
    expect(r.state.climb.trap.state).toBe('fell'); expect(r.state.climb.top).toBe(true); expect(r.trap).toBeNull(); expect(r.log).toContain('ловушка провалилась')
  })
  it('двойник на другой ступени или чужое слово на ступени с ловушкой — обычный промах; ловушка стоит', () => {
    let s = ev(initRace(), 'enter', steps[0]).state
    const other = ev(s, 'miss', steps[0], { heard: 'earn' }) // у ступени 1 двойников нет
    expect(other.trap).toBeNull(); expect(other.say).toBe('race_climb_slip'); expect(other.state.climb.trap.state).toBe('stand')
    for (const k of [1, 2, 3]) s = ev(ev(s, 'win', steps[k - 1]).state, 'enter', steps[k]).state
    const wrong = ev(s, 'miss', steps[3], { heard: 'table' })
    expect(wrong.trap).toBeNull(); expect(wrong.state.climb.trap.state).toBe('stand')
  })
  it('не больше одной ловушки: осыпавшаяся не возвращается и второй раз не срабатывает; второй двойник — обычный промах', () => {
    let c = initClimb(4, steps[0].trap)
    for (let i = 0; i < 3; i++) c = apply(enter(c, 1), 'win').climb
    const first = apply(enter(c, 1), 'miss', 'earn')
    expect(first.trapped).toBe('earn'); c = first.climb
    const again = apply(enter(c, 1), 'miss', 'lean')
    expect(again.trapped).toBe(''); expect(again.climb.trap.state).toBe('crumbled'); expect(again.climb.trap.at).toBe(first.climb.trap.at) // второй раз крошение не играет
  })
})

describe('ловушка: голос Пита «это …, а нужно …»', () => {
  const run = (lines, sayLineOk = true) => {
    const calls = [], timers = []
    const cancel = sayTrap({ said: 'earn', word: 'learn', lines, rate: 1, sayLine: (id, v) => { calls.push(['line', id, v?.caption]); return sayLineOk }, sayText: t => calls.push(['word', t]), setTimer: (f, ms) => { timers.push([ms, f]); return timers.length }, clearTimer: () => {} })
    return { calls, timers, cancel }
  }
  const voiced = { race_trap_pre: { url: 'u', duration: 0.4 }, race_trap_mid: { url: 'u', duration: 0.6 } }
  it('есть озвучка «это» и «а нужно»: «это» → двойник → «а нужно» → слово, куски по порядку, подпись полная', () => {
    const { calls, timers } = run(voiced)
    expect(calls).toEqual([['line', 'race_trap_pre', 'это earn, а нужно learn']])
    expect(timers.map(t => t[0])).toEqual([...timers.map(t => t[0])].sort((a, b) => a - b)) // моменты по возрастанию
    timers.forEach(t => t[1]())
    expect(calls.slice(1).map(c => c[0] === 'word' ? c[1] : c[1])).toEqual(['earn', 'race_trap_mid', 'learn'])
  })
  it('нет озвучки или Пит занят: одна короткая реплика с полной подписью, таймеров нет', () => {
    const a = run({}); expect(a.calls).toEqual([['line', 'race_trap_short', 'это earn, а нужно learn']]); expect(a.timers).toHaveLength(0)
    const b = run(voiced, false); expect(b.calls.at(-1)[1]).toBe('race_trap_short'); expect(b.timers).toHaveLength(0)
  })
})
