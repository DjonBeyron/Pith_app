import { describe, it, expect, vi } from 'vitest'
import { createTransChron, segOf } from './raceTransChron.js'

const st = (sid, type, act, extra = {}) => ({ sid, type, act, ...extra })
const setup = () => { let t = 0; const log = vi.fn(); const tr = createTransChron({ now: () => t, log }); return { tr, log, at: v => { t = v }, lines: () => log.mock.calls.map(c => c[0]) } }

describe('журнал переходов «[start] переход …» (raceTransChron.js)', () => {
  it('отрезки: -ann / -sw к своему этапу, вся «Вершина» — climb', () => {
    expect(segOf(st('catch-sw', 'announce', 'catch'))).toBe('catch')
    expect(segOf(st('phrases1-ann', 'announce', 'phrases'))).toBe('phrases1')
    expect(segOf(st('climb-3', 'student', 'climb'))).toBe('climb')
  })
  it('старт → первая ступень: плашка, реплика, первая пилюля от входа в игру', () => {
    const s = setup()
    s.tr.begin('старт'); s.tr.plate('Пинг-понг')
    s.at(15); s.tr.line('race_start')
    s.at(1900); s.tr.stage(st('sprint-ann', 'announce', 'sprint', { charge: true }))
    s.at(4600); s.tr.stage(st('sprint', 'student', 'sprint'))
    s.at(5100); s.tr.pill(); s.tr.pill()
    expect(s.lines()).toEqual(['[start] переход старт → Пинг-понг A: плашка через 0 мс, реплика через 15 мс («race_start»), первая пилюля через 5100 мс; плашки: «Пинг-понг» +0'])
  })
  it('A → B: от последнего события ступени A; несколько плашек — списком', () => {
    const s = setup()
    s.tr.stage(st('sprint', 'student', 'sprint')); s.at(20000); s.tr.last()
    s.at(21300); s.tr.stage(st('catch-sw', 'announce', 'catch')); s.tr.plate('Секунду')
    s.at(21600); s.tr.line('race_switch_ru')
    s.at(22500); s.tr.stage(st('catch-ann', 'announce', 'catch')); s.tr.plate('')
    s.at(23700); s.tr.stage(st('catch', 'student', 'catch'))
    s.at(24250); s.tr.pill()
    expect(s.lines()[0]).toBe('[start] переход Пинг-понг A → Пинг-понг B: плашка через 1300 мс, реплика через 1600 мс («race_switch_ru»), первая пилюля через 4250 мс; плашки: «Секунду» +1300, «подпись» +2500')
  })
  it('плашка этапа без пилюль («Фразы») закрывает свой отрезок, следующий считается от смены этапа', () => {
    const s = setup()
    s.tr.stage(st('catch2', 'student', 'catch')); s.at(1000); s.tr.last()
    s.at(2300); s.tr.stage(st('phrases-sw', 'announce', 'phrases')); s.tr.plate('Секунду')
    s.at(3400); s.tr.stage(st('phrases-ann', 'announce', 'phrases')); s.tr.plate('Фразы')
    s.at(4600); s.tr.stage(st('phrases1-ann', 'announce', 'phrases')); s.tr.plate('Пойми')
    s.at(4870); s.tr.line('race_phrases_pick')
    s.at(5800); s.tr.stage(st('phrases1', 'student', 'phrases')); s.tr.pill()
    expect(s.lines()).toEqual([
      '[start] переход Пинг-понг B, круг 2 → плашка «Фразы»: плашка через 1300 мс, реплика через —, первая пилюля через —, дальше «Фразы, круг 1» через 3600 мс; плашки: «Секунду» +1300, «Фразы» +2400',
      '[start] переход плашка «Фразы» → Фразы, круг 1: плашка через 0 мс, реплика через 270 мс («race_phrases_pick»), первая пилюля через 1200 мс; плашки: «Пойми» +0',
    ])
  })
})
