import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { miaStep, miaStepMark } from './miaLagMark.js'
import { LEAVE, SOLO, ARR } from './miaMotion.js'

// Метки движений Мии для трассера лагов: шаг эпизода по кадру и подпись на его смене
describe('метки движений Мии «[lag-mark]»', () => {
  it('шаг эпизода: коробки нет → коробка упала → Мия летит → сидит → уход / прыжок одной', () => {
    expect(miaStep(false, 'arr', false, false)).toBe('')
    expect(miaStep(false, 'arr', false, true)).toBe('box')
    expect(miaStep(false, 'arr', true, true)).toBe('jump')
    expect(miaStep(false, 'solo', false, true)).toBe('solo')
    expect(miaStep(false, 'stuck', false, true)).toBe('box') // коробка одна на Пите — отмечать нечего
    expect(miaStep(true, 'lv', false, true)).toBe('leave')
  })
  it('подпись и длительность — на смене шага; длительности из движения (miaMotion.js)', () => {
    expect(miaStepMark('', 'box')).toEqual(['Мия: коробка падает на Пита', Math.round((ARR.FALL + 0.4) * 1000)])
    expect(miaStepMark('box', 'jump')).toEqual(['Мия: прыжок на коробку', Math.round(ARR.JUMP_LEN * 1000)])
    expect(miaStepMark('jump', 'box')).toEqual(['Мия: посадка на коробку', 600])
    expect(miaStepMark('box', 'leave')).toEqual(['Мия: уход с коробкой за экран', Math.round(LEAVE.END * 1000)])
    expect(miaStepMark('box', 'leave', true)).toEqual(['коробка отлетает без Мии', Math.round(LEAVE.END * 1000)])
    expect(miaStepMark('box', 'solo')).toEqual(['Мия: прыжок одна за экран', Math.round(SOLO.END * 1000)])
    expect(miaStepMark('solo', 'box')).toBeNull(); expect(miaStepMark('leave', '')).toBeNull()
  })
  it('кадр RaceMia отмечает только смену шага; перекраску поля отмечает игра', () => {
    const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
    expect(read('../RaceMia.jsx')).toContain('if (step !== shown.step) { markMiaStep(shown.step, step, sp.alone); shown.step = step }')
    expect(read('../../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("useLagTrace(f.dbg.enabled, f.paused, f.stageObj?.type === 'summary'); useLagMarkOn(miaTint, 'цвет дорожек → Мия', 'цвет дорожек → обычный', 900)")
  })
})
