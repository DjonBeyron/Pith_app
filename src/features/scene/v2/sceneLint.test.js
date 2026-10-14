import { describe, it, expect } from 'vitest'
import { lintScene, lintErrors, lintSceneText } from './sceneLint.js'
import { demoOfficeScene, demoCafeScene, DEMO_SCENES } from './demoScenes.js'
import { sceneLegendText, sceneLegend } from './sceneLegend.js'
import { PROP_IDS } from './sprites/spriteRegistry.js'

const clone = s => JSON.parse(JSON.stringify(s))
const texts = items => items.map(i => i.text)

describe('lintScene', () => {
  it('демо-сцены проходят без ошибок и предупреждений', () => {
    for (const s of DEMO_SCENES) expect(lintScene(s), s.id).toEqual([])
  })

  it('ошибки схемы попадают в линт как error', () => {
    const s = clone(demoOfficeScene)
    s.timeline = [s.timeline[0]]
    const items = lintScene(s)
    expect(items.some(i => i.level === 'error' && i.text.includes('минимум'))).toBe(true)
    expect(lintErrors(s).length).toBeGreaterThan(0)
  })

  it('предмет на столе без стола — ошибка «висит в воздухе»', () => {
    const s = clone(demoOfficeScene)
    s.slots.table = null
    expect(texts(lintScene(s)).some(t => t.includes('висит в воздухе') && t.startsWith('slots.desk-left'))).toBe(true)
  })

  it('пустые слоты — предупреждение со списком; все пустые — своё предупреждение', () => {
    const s = clone(demoCafeScene)
    s.slots.ceiling = null
    s.slots['floor-right'] = null
    const w = lintScene(s).find(i => i.text.startsWith('slots — пустые'))
    expect(w.level).toBe('warn')
    expect(w.text).toContain('ceiling')
    expect(w.text).toContain('floor-right')
    const bare = clone(demoCafeScene)
    bare.slots = {}
    expect(texts(lintScene(bare)).some(t => t.includes('все слоты пустые'))).toBe(true)
  })

  it('неизвестный предмет и несовместимый слот — ошибки', () => {
    const s = clone(demoOfficeScene)
    s.slots.window = 'spaceship'
    s.slots['wall-clock'] = 'plant'
    const errs = lintErrors(s)
    expect(errs.some(e => e.includes("'spaceship'"))).toBe(true)
    expect(errs.some(e => e.startsWith('slots.wall-clock'))).toBe(true)
  })

  it('диалог: один говорит 3 подряд, персонаж молчит, длинно, без знака, одна эмоция', () => {
    const s = clone(demoOfficeScene)
    s.timeline = [
      { who: 'a', text: 'Раз.', emotion: 'neutral' },
      { who: 'a', text: 'Два.', emotion: 'neutral' },
      { who: 'a', text: 'Три без точки', emotion: 'neutral' },
      { who: 'a', text: 'Ч'.repeat(120) + '.', emotion: 'neutral' },
    ]
    const t = texts(lintScene(s))
    expect(t.some(x => x.includes("'a' говорит 3 реплики подряд"))).toBe(true)
    expect(t.some(x => x.includes("'b' ни разу не говорит"))).toBe(true)
    expect(t.some(x => x.startsWith('timeline[2].text') && x.includes('без знака'))).toBe(true)
    expect(t.some(x => x.startsWith('timeline[3].text') && x.includes('длинно'))).toBe(true)
    expect(t.some(x => x.includes('одна эмоция'))).toBe(true)
    expect(lintScene(s).every(i => i.level === 'warn')).toBe(true)
  })

  it('одинаковые имена / одинаковая шерсть при одном поле — предупреждения', () => {
    const s = clone(demoOfficeScene)
    s.characters.b.name = 'рыжик'
    s.characters.b.gender = 'male'
    s.characters.b.palette = { ...s.characters.a.palette }
    const t = texts(lintScene(s))
    expect(t.some(x => x.includes('одно имя'))).toBe(true)
    expect(t.some(x => x.includes('котов не отличить'))).toBe(true)
  })

  it('audioUrl без wordTimings — предупреждение; с таймингами — нет', () => {
    const s = clone(demoOfficeScene)
    s.timeline[0].audioUrl = 'https://cdn/x.mp3'
    expect(texts(lintScene(s)).some(x => x.includes('нет wordTimings'))).toBe(true)
    s.timeline[0].wordTimings = [{ word: 'Дымка', start: 0, end: 0.4 }]
    expect(texts(lintScene(s)).some(x => x.includes('нет wordTimings'))).toBe(false)
  })

  it('бюджет узлов: в потолке по умолчанию — чисто, при ужесточённом потолке — ошибка с числами', () => {
    expect(lintScene(demoOfficeScene).some(i => i.text.startsWith('Бюджет узлов'))).toBe(false)
    const err = lintScene(demoOfficeScene, { nodeBudget: 100 }).find(i => i.text.startsWith('Бюджет узлов'))
    expect(err.level).toBe('error')
    expect(err.text).toMatch(/\d+ > 100/)
  })

  it('lintSceneText даёт строки с пометкой уровня; не-объект — одна ошибка', () => {
    expect(lintSceneText(null)).toEqual(['Ошибка: Сцена должна быть объектом'])
    const s = clone(demoOfficeScene)
    s.slots.window = null
    expect(lintSceneText(s)[0]).toMatch(/^Внимание: slots — пустые/)
  })
})

describe('легенда для нейросети', () => {
  it('содержит поля, все id предметов, слоты обеих локаций, правила и валидный пример', () => {
    const text = sceneLegendText()
    expect(text).toContain('## Поля')
    for (const id of PROP_IDS) expect(text).toContain(`- ${id} —`)
    expect(text).toContain('## Слоты локации office')
    expect(text).toContain('## Слоты локации cafe')
    expect(text).toContain('## Правила хорошего диалога')
    const example = text.slice(text.indexOf('## Пример валидной сцены') + '## Пример валидной сцены'.length)
    expect(lintScene(JSON.parse(example))).toEqual([])
    const legend = sceneLegend()
    expect(legend.enums.emotion).toContain('surprised')
    expect(legend.sprites).toHaveLength(PROP_IDS.length)
    expect(legend.limits.nodeBudget).toBe(250)
  })
})
