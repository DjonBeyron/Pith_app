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
  it('лица Мии меняются без перекрёстного проявления (двойной контур глаз): головы подменяются жёстко, но на сомкнутых глазах (моргание, v3.3.288)', () => {
    const src = rd('../../player/modules/rotate-phone/useMiaLife.js'), sw = rd('./miaFaceSwap.js')
    expect(src).toContain('swapFace(prev, next'); expect(src).not.toContain('next.animate'); expect(sw).toContain("next.style.display = ''; prev.style.display = 'none'"); expect(sw).not.toContain('.animate(')
  })
  it('«скажи её сам» после примера: плашка круга с примером — race_phrases_show, DEMO_GO — race_phrases_say', () => {
    expect(rd('../racePhraseDemo.js')).toContain("DEMO_GO = 'race_phrases_say'"); expect(rd('../raceStagesPhrases.js')).toContain("line: demo ? 'race_phrases_show' : ROUND_PLATES.say.line")
  })
})

describe('замечания 2026-11-16 вечер (v3.3.260)', () => {
  it('бар «Разгона» / «Слушай и лови» остаётся между этапами пустым и не гаснет; плашка переключения слуха у Мии без текста', () => {
    expect(rd('../RaceBar.jsx')).toContain("stage?.type === 'announce' && BAR_ACTS.includes(stage.act)")
    expect(rd('../boss/raceStagesBoss.js')).toContain("round: { kind: 'switch', title: '', task: '', brief: '' }")
  })
  it('цвет принятой пилюли финала закрепляется на зоне принятия сразу (data-bzf без плавного перехода); пул сбрасывает признаки', () => {
    expect(rd('../boss/bossScaleDrive.js')).toContain("setAttribute('data-bzf', '')")
    const css = rd('../../../styles/player/modules/race-boss.css')
    expect(css).not.toMatch(/transition: --bz/); expect(css).toContain('меняется МГНОВЕННО') // вход в новую зону — цвет пилюли сразу
    expect(rd('../../player/modules/rotate-phone/wordLanePool.js')).toContain("'data-bzf', 'data-scatter'")
  })
  it('круги выбора «Пойми» / «Узнай» вырезаны (владелец 2026-11-24): разлёта и красной рамки неверного тапа в сцене фраз нет; сам разлёт остался в движке', () => {
    const sc = rd('../racePhraseScene.js'); expect(sc).not.toContain('scatterAll'); expect(sc).not.toContain('data-wrong')
    const rise = rd('../../player/modules/rotate-phone/wordLaneRise.js'); expect(rise).toContain('export function startScatter'); expect(rise).toContain('SCATTER_MS')
  })
})
