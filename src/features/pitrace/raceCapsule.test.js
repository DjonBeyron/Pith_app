import { describe, it, expect } from 'vitest'
import { capText, outWord, capFont, capWidth, capLeft, capVars, CAP_MAX_VW, CAP_FONT_MIN, CAP_FONT_MAX } from './raceCapsule.js'
import { heroFrames, jumpOf } from './raceClimbCam.js'

const words = ["I'm", 'trying', 'to', 'learn']

describe('капсула героя «Вершины»', () => {
  it('текст — первые rung слов: на земле пусто, растёт по слову, на вершине вся фраза', () => {
    expect([0, 1, 2, 3, 4].map(r => capText(words, r))).toEqual(['', "I'm", "I'm trying", "I'm trying to", "I'm trying to learn"])
    expect(capText(words, 9)).toBe("I'm trying to learn"); expect(capText(words, -1)).toBe('')
  })
  it('при соскоке вылетает слово оставленной ступени; при взятии или на месте — ничего', () => {
    expect(outWord(words, 3, 2)).toBe('to'); expect(outWord(words, 4, 3)).toBe('learn')
    expect(outWord(words, 2, 3)).toBe(''); expect(outWord(words, 1, 1)).toBe('')
  })
  it('шрифт и ширина — CSS: не шире 86 % экрана, шрифт от 17 до 12 px по длине; положение прижато к краям', () => {
    expect([CAP_MAX_VW, CAP_FONT_MIN, CAP_FONT_MAX]).toEqual([86, 12, 17])
    expect(capFont(5)).toContain('clamp(12px'); expect(capFont(5)).toContain('17px'); expect(capFont(40)).toContain('/ 22.40')
    expect(capWidth(10)).toContain('min(86vw'); expect(capWidth(0)).toContain('max(34px')
    expect(capLeft(0.17)).toBe('clamp(calc(var(--cw) / 2 + 8px), 17.00%, calc(100% - var(--cw) / 2 - 8px))')
    expect(Object.keys(capVars(7))).toEqual(['--cf', '--cw'])
  })
  it('кадры прыжка берут left из строк капсулы (fromLeft / toLeft); без них — доли дорожек, как раньше', () => {
    const f = heroFrames({ ...jumpOf(1, 2), fromLeft: capLeft(0.17), toLeft: capLeft(0.5) })
    expect(f.move[0].left).toContain('clamp('); expect(f.move[1].left).toContain('50.00%')
    expect(heroFrames(jumpOf(1, 2)).move).toEqual([{ left: '17.00%' }, { left: '50.00%' }])
    expect(heroFrames({ ...jumpOf(2, 2), toLeft: 'X' }).move).toEqual([{ left: 'X' }, { left: 'X' }])
  })
})
