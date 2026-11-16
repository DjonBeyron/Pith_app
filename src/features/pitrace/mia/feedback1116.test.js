import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { reduceMia, miaInit, MIA } from './raceMia.js'
import { chargePlan } from '../raceCharge.js'

const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('замечания 2026-11-16 (v3.3.259)', () => {
  it('коробка падает после реплики Пита: срок задаёт директор (dropAt) поверх стадии и константы', () => {
    const stage = { mia: 'ann', act: 'catch', line: 'pit_forgot' }
    expect(reduceMia(miaInit(), { t: 'enter', stage, now: 1000 }).mia.at).toBe(1000 + MIA.DROP_AT)
    expect(reduceMia(miaInit(), { t: 'enter', stage, now: 1000, dropAt: 2900 }).mia.at).toBe(3900)
    expect(rd('./useMiaEnter.js')).toContain("300 + mspeech.msOf(running.line, 'pit')")
  })
  it('прогресс-бар: слова прилетают в порядке слов круга (как сегменты бара в игре), риски между цветами', () => {
    const words = ['a', 'b', 'c', 'd'].map((text, i) => ({ text, level: i }))
    const plan = chargePlan({ seed: 7, words }, 3000, words)
    expect(plan.pills.map(p => p.text)).toEqual(['a', 'b', 'c', 'd']); expect(plan.segments.map(s => s.level)).toEqual([0, 1, 2, 3])
    expect(rd('../../../styles/player/modules/race-bar.css')).toMatch(/\.raceBarSeg:not\(:last-child\) \{ background-image: linear-gradient\(to left, rgba\(8, 10, 16, 0\.75\) 1px/)
    expect(rd('../../../styles/player/modules/race-charge.css')).toMatch(/\.raceChargeSeg:not\(:last-of-type\) \{ background-image: linear-gradient\(to left/)
  })
  it('лица Мии меняются жёстко (без перекрёстного проявления: двойной контур глаз)', () => {
    const src = rd('../../player/modules/rotate-phone/useMiaLife.js')
    expect(src).toContain("next.style.display = ''; prev.style.display = 'none'"); expect(src).not.toContain('next.animate')
  })
  it('«скажи её сам» после примера: плашка круга с примером — race_phrases_show, DEMO_GO — race_phrases_say', () => {
    expect(rd('../racePhraseDemo.js')).toContain("DEMO_GO = 'race_phrases_say'"); expect(rd('../raceStagesPhrases.js')).toContain("line = 'race_phrases_show'")
  })
})
