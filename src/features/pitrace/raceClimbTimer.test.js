import { describe, it, expect } from 'vitest'
import { CLIMB_START_MS, CLIMB_BONUS_MS, budgetMs, leftMs, isOut, barFraction, CLIMB_STEP_SPEED } from './raceClimbTimer.js'
import { initClimb, enter, apply, timeOut, nextOf, medalOf } from './raceLadder.js'

const at = (c, t) => ({ ...c, t0: 1000, now: 1000 + t }) // t — мс после старта таймера

describe('общий таймер «Вершины»: 12 с, +5 с за ступень', () => {
  it('константы: 12 с на старте, +5 с за ступень; запас растёт с каждой взятой ступенью', () => {
    expect(CLIMB_START_MS).toBe(12000); expect(CLIMB_BONUS_MS).toBe(5000)
    expect([0, 1, 3].map(budgetMs)).toEqual([12000, 17000, 27000])
  })
  it('таймер стартует на первом заходе (enter с часами) и не перезапускается следующими', () => {
    const a = enter(initClimb(4), 5000)
    expect(a.t0).toBe(5000)
    expect(enter(a, 9000).t0).toBe(5000)
    expect(enter(initClimb(4)).t0).toBeNull() // без часов таймера нет
    expect(leftMs(initClimb(4), 99999)).toBe(CLIMB_START_MS) // до старта полный запас
  })
  it('остаток убывает со временем, взятая ступень добавляет +5 с, ноль — не ниже', () => {
    let c = enter(initClimb(4), 1000)
    expect(leftMs(c, 1000 + 4000)).toBe(8000)
    c = apply(enter(c, 6000), 'win').climb // взял ступень на 5-й секунде
    expect(leftMs(c, 1000 + 5000)).toBe(12000 + 5000 - 5000)
    expect(leftMs(c, 1000 + 40000)).toBe(0)
    expect(barFraction(at(initClimb(3), 0), 1000)).toBe(12000 / 17000); expect(barFraction({ t0: 0, wins: 5 }, 0)).toBe(1)
  })
  it('время вышло: isOut только пока вершины нет и таймер идёт; timeOut — подъём заканчивается на текущем острове, медали нет, дальше плашка «время вышло»', () => {
    let c = apply(enter(initClimb(4), 0), 'win').climb
    c = apply(enter(c, 100), 'win').climb // стоит на 2-м острове, запас 12 + 10 = 22 с
    expect(isOut(c, 21000)).toBe(false); expect(isOut(c, 22001)).toBe(true)
    const t = timeOut(c)
    expect(t).toMatchObject({ rung: 2, timedOut: true, last: 'time', top: false }); expect(t.seq).toBe(c.seq + 1)
    expect(nextOf(t)).toBe('time'); expect(medalOf(t)).toBe('none')
    expect(isOut(t, 99999)).toBe(false) // повторно не сработает
    const top = [1, 2, 3, 4].reduce(x => apply(enter(x, 0), 'win').climb, initClimb(4))
    expect(isOut(top, 99999)).toBe(false) // добрался до вершины — таймер уже не нужен
    expect(medalOf(top)).toBe('gold')
  })
  it('пилюля ступени движка почти стоит: собственное «не успел» недостижимо раньше общего таймера', () => {
    expect(CLIMB_STEP_SPEED).toBeLessThanOrEqual(0.15)
  })
})
