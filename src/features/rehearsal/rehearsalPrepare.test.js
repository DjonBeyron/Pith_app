import { describe, it, expect } from 'vitest'
import { neededTexts, firstLines, hasIntroLine } from './rehearsalPrepare.js'
import { readRehearsalCfg } from './rehearsalCfg.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { planTexts } from './rehearsalPlan.js'
import { ONLY_IDS } from './rehearsalOnly.js'

// Что тап «Начать» готовит репетиции: полная репетиция — всё, один этап «Шлифовки» — только его слова; реплики первых секунд — отдельно
const base = fixturePlan('three')
const withOnly = only => ({ ...base, only })

describe('neededTexts: озвучка, которую качает тап', () => {
  it('полная репетиция (only нет): все слова плана, как раньше', () => {
    expect(neededTexts(base)).toEqual(planTexts(base))
  })
  it('читка, сборка, «без текста», дубль и зеркало: хватает трёх кусков фразы — слова и двойники не качаются', () => {
    for (const only of ['read', 'build', 'blind', 'take']) {
      const t = neededTexts(withOnly(only))
      expect(t, only).toEqual(expect.arrayContaining(base.chunks))
      expect(t.length, only).toBeLessThan(planTexts(base).length)
    }
    expect(neededTexts(withOnly('read'))).toEqual(base.chunks)
  })
  it('«Различи»: слово акта и его двойники (запутыватели звучат на пилюлях)', () => {
    const t = neededTexts(withOnly('discern'))
    const dis = base.words.find(w => w.confusers.length)
    expect(t).toContain(dis.text); for (const c of dis.confusers) expect(t).toContain(c)
  })
  it('разминка: куски и слова «к повтору»; без повторов в списке', () => {
    const t = neededTexts(withOnly('warmup'))
    expect(new Set(t.map(x => x.toLowerCase())).size).toBe(t.length)
    expect(t).toEqual(expect.arrayContaining(base.chunks))
  })
  it('каждый этап «Шлифовки» не просит больше, чем вся репетиция', () => {
    const all = new Set(planTexts(base).map(x => x.toLowerCase()))
    for (const only of ONLY_IDS) for (const t of neededTexts(withOnly(only))) expect(all.has(t.toLowerCase()), `${only}: ${t}`).toBe(true)
  })
})

describe('hasIntroLine: вступление Пита', () => {
  it('есть в полной репетиции и у «Заставки»; у любого другого одного этапа — нет', () => {
    expect(hasIntroLine(base)).toBe(true); expect(hasIntroLine(withOnly('intro'))).toBe(true)
    for (const only of ONLY_IDS.filter(x => x !== 'intro')) expect(hasIntroLine(withOnly(only)), only).toBe(false)
  })
})

describe('firstLines: реплики Пита первых секунд', () => {
  it('вступление и реплика первого акта; у итога — «Отлично, получилось!»; у заставки — только вступление', () => {
    expect(firstLines(base)).toEqual(['rh_start', 'rh_warmup'])
    expect(firstLines(withOnly('read'))).toEqual(['rh_read_why']) // один этап «Шлифовки»: без вступления
    expect(firstLines(withOnly('build'))).toEqual(['rh_build'])
    expect(firstLines(withOnly('summary'))).toEqual(['rh_done'])
    expect(firstLines(withOnly('intro'))).toEqual(['rh_start'])
  })
  it('настройки игры несут и слова, и первые реплики', () => {
    const cfg = readRehearsalCfg(withOnly('read'))
    expect(cfg.extraWords).toEqual(base.chunks); expect(cfg.firstLines).toEqual(['rh_read_why'])
    expect(readRehearsalCfg(base).extraWords).toEqual(planTexts(base))
  })
})
