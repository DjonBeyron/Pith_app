import { describe, it, expect } from 'vitest'
import { initClimb, enter, apply, nextOf, medalOf, targetOf, maxAttempts, HINT_AT, BLINK_AT } from './raceLadder.js'

// Прогон: список событий 'win' | 'miss' | 'fail'; перед каждым win / fail — начало захода (enter), как в директоре
function run(n, events) {
  let c = initClimb(n)
  const hints = []
  for (const ev of events) {
    if (ev !== 'miss') c = enter(c)
    const r = apply(c, ev)
    c = r.climb
    if (r.hint) hints.push(r.hint)
  }
  return { c, hints }
}

describe('лестница «Вершины»: события → ступень, заходы, подсказки, медаль', () => {
  it('попал — прыжок на ступень k, подпись k-го слова горит; промахов нет — вершина за N заходов, золото', () => {
    const { c } = run(4, ['win', 'win', 'win', 'win'])
    expect(c.rung).toBe(4); expect(c.top).toBe(true); expect(c.attempts).toBe(4)
    expect(c.lit).toEqual([true, true, true, true])
    expect(medalOf(c)).toBe('gold'); expect(nextOf(c)).toBe('top')
    const one = apply(enter(initClimb(4)), 'win').climb
    expect(one.rung).toBe(1); expect(one.last).toBe('hit'); expect(targetOf(one)).toBe(2); expect(nextOf(one)).toBe(2)
  })
  it('не успел — соскальзывание на ступень вниз, подпись оставленной ступени гаснет; на первой ступени остаёмся', () => {
    const a = run(4, ['win', 'win', 'win', 'fail']).c // стоял на 3-й, заход на 4-ю не удался
    expect(a.rung).toBe(2); expect(a.lit).toEqual([true, true, false, false]); expect(a.last).toBe('slip'); expect(targetOf(a)).toBe(3)
    expect(run(4, ['fail']).c.rung).toBe(0) // на земле остаёмся
    const first = run(4, ['win', 'fail']).c // стоял на 1-й
    expect(first.rung).toBe(1); expect(first.lit).toEqual([true, false, false, false]); expect(targetOf(first)).toBe(2)
  })
  it('сказал не то (miss) — только дрожь, ступень решает время (fail)', () => {
    const r = apply(enter(initClimb(3)), 'miss')
    expect(r.climb.rung).toBe(0); expect(r.climb.last).toBe('shake'); expect(r.climb.attempts).toBe(1); expect(r.hint).toBeNull()
  })
  it('подсказки: 2-й промах одной ступени — Пит говорит слово k голосом, 3-й — подпись мигает; взятая ступень сбрасывает счёт', () => {
    const { c, hints } = run(4, ['win', 'fail', 'fail', 'fail']) // ступень 2: промахи на ней идут подряд (стоим на 1-й, остаёмся)
    expect(hints).toEqual([2]) // ровно один раз — на втором промахе
    expect(HINT_AT).toBe(2); expect(BLINK_AT).toBe(3)
    expect(c.fails[2]).toBe(3); expect(c.blink).toBe(1); expect(c.blinkK).toBe(2)
    const after = run(4, ['win', 'fail', 'fail', 'win']).c
    expect(after.fails[2]).toBe(0) // взяли — счёт этой ступени с нуля
    expect(run(4, ['win', 'fail', 'fail', 'fail', 'fail']).c.blink).toBe(2) // дальше мигает снова
  })
  it('медаль: ровно N заходов — золото, не больше N + 2 — серебро, иначе без медали; вершины нет — «none»', () => {
    expect(medalOf(run(3, ['win', 'win', 'win']).c)).toBe('gold')
    expect(medalOf(run(3, ['win', 'fail', 'win', 'win', 'win']).c)).toBe('silver') // 5 заходов = N + 2
    expect(medalOf(run(3, ['fail', 'fail', 'fail', 'win', 'win', 'win']).c)).toBe('finish') // 6 заходов
    expect(medalOf(run(3, ['win', 'fail']).c)).toBe('none')
    expect(medalOf(null)).toBe('none')
  })
  it('потолок заходов: вечные промахи не держат — лестница отпускает (over) и идёт плашка вершины без медали', () => {
    const { c } = run(2, Array(maxAttempts(2)).fill('fail'))
    expect(c.over).toBe(true); expect(c.top).toBe(false); expect(nextOf(c)).toBe('top'); expect(medalOf(c)).toBe('none')
    expect(run(2, Array(maxAttempts(2) - 1).fill('fail')).c.over).toBe(false)
  })
  it('N ступеней = N слов: на вершине k = N', () => {
    for (const n of [1, 3, 6]) { const { c } = run(n, Array(n).fill('win')); expect(c.rung).toBe(n); expect(c.lit).toHaveLength(n); expect(c.top).toBe(true) }
  })
})
