import { describe, it, expect } from 'vitest'
import { validateSceneV2, normalizeSceneV2, parseSceneV2 } from './sceneSchemaV2.js'
import { PIT, isSolo, speakersOf, pitCharacter } from './scenePit.js'
import { lintScene } from './sceneLint.js'
import { sceneNodeBudget, sceneNodeBreakdown } from './sceneBudget.js'
import { sceneStaticMarkup } from './staticMarkup.js'
import { sceneLegendText, sceneLegend } from './sceneLegend.js'
import { demoOfficeScene, demoCafeScene, demoPitCircleScene } from './demoScenes.js'
import { CAT_PLACEMENT, catPlacement } from './sprites/slots.js'

// Одиночная сцена (один кот Пит, characters без b) — формат, валидатор, нормализация, линтер, бюджет, статика

const clone = s => JSON.parse(JSON.stringify(s))

describe('scenePit — isSolo / PIT', () => {
  it('одиночная — characters с a и без b; пустой объект, две кошки, не объект — нет', () => {
    expect(isSolo(demoPitCircleScene)).toBe(true)
    expect(isSolo(demoOfficeScene)).toBe(false)
    expect(isSolo({ characters: {} })).toBe(false)
    expect(isSolo({ characters: null })).toBe(false)
    expect(isSolo(null)).toBe(false)
    expect(speakersOf(demoPitCircleScene)).toEqual(['a'])
    expect(speakersOf(demoCafeScene)).toEqual(['a', 'b'])
  })
  it('Пит — валидный персонаж с умолчаниями a; копия не замороженная', () => {
    expect(PIT.name).toBe('Пит')
    const s = { ...clone(demoPitCircleScene), characters: { a: PIT } }
    expect(validateSceneV2(s)).toEqual([])
    const c = pitCharacter()
    c.name = 'Другой'
    expect(PIT.name).toBe('Пит')
    expect(Object.isFrozen(PIT)).toBe(true)
  })
  it('одиночный кот стоит по центру: центр головы (x 100 в спрайте) на оси сцены x 180', () => {
    const p = catPlacement('a', true)
    expect(p).toBe(CAT_PLACEMENT.solo)
    expect(p.x + 100 * CAT_PLACEMENT.scale).toBe(180)
    expect(p.y).toBe(CAT_PLACEMENT.a.y)
    expect(catPlacement('a', false)).toBe(CAT_PLACEMENT.a)
    expect(catPlacement('b', false)).toBe(CAT_PLACEMENT.b)
  })
})

describe('validateSceneV2 — одиночная сцена', () => {
  it('демо «Кружок Пита» валидно и без замечаний линтера', () => {
    expect(validateSceneV2(demoPitCircleScene)).toEqual([])
    expect(lintScene(demoPitCircleScene)).toEqual([])
  })
  it("who: 'b' в одиночной сцене — ошибка с путём реплики", () => {
    const s = clone(demoPitCircleScene)
    s.timeline[1].who = 'b'
    const errs = validateSceneV2(s)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatch(/^timeline\[1\]\.who — в сцене один персонаж/)
  })
  it('b: null — не «нет b», а сломанный персонаж (ошибка как раньше)', () => {
    const s = clone(demoOfficeScene)
    s.characters.b = null
    expect(validateSceneV2(s).some(e => e.startsWith('characters.b'))).toBe(true)
  })
  it('старые сцены с двумя котами — без изменений', () => {
    expect(validateSceneV2(demoOfficeScene)).toEqual([])
    expect(validateSceneV2(demoCafeScene)).toEqual([])
    const s = clone(demoOfficeScene)
    delete s.characters.b.gender
    expect(validateSceneV2(s).some(e => e.startsWith('characters.b.gender'))).toBe(true)
  })
})

describe('normalizeSceneV2 — одиночная сцена', () => {
  it('b не достраивается, who реплик → a; parseSceneV2 тоже', () => {
    const n = normalizeSceneV2({ version: 2, location: 'office', characters: { a: { name: 'Пит' } }, timeline: [{ who: 'b', text: 'Эй.' }] })
    expect(n.characters.b).toBeUndefined()
    expect(Object.keys(n.characters)).toEqual(['a'])
    expect(n.characters.a.gender).toBe('male')
    expect(n.timeline[0].who).toBe('a')
    const { scene, errors } = parseSceneV2(JSON.stringify(demoPitCircleScene))
    expect(errors).toEqual([])
    expect(isSolo(scene)).toBe(true)
  })
  it('двух котов нормализация достраивает как раньше (b: {} и characters: {})', () => {
    expect(normalizeSceneV2({ characters: { a: {}, b: {} } }).characters.b.name).toBe('Кошка')
    expect(normalizeSceneV2({ characters: {} }).characters.b.name).toBe('Кошка')
    expect(normalizeSceneV2({}).characters.b).toBeDefined()
  })
})

describe('lintScene / бюджет / статика — одиночная сцена', () => {
  it('правила «b не говорит» и «подряд один говорящий» не применяются', () => {
    const s = clone(demoPitCircleScene)
    s.timeline = [
      { who: 'a', text: 'Раз.', emotion: 'happy' }, { who: 'a', text: 'Два.', emotion: 'neutral' },
      { who: 'a', text: 'Три.', emotion: 'surprised' }, { who: 'a', text: 'Четыре.', emotion: 'tired' },
    ]
    const texts = lintScene(s).map(i => i.text)
    expect(texts.some(t => t.includes('ни разу не говорит'))).toBe(false)
    expect(texts.some(t => t.includes('подряд'))).toBe(false)
    // у двух котов то же самое — предупреждения
    const duo = clone(demoOfficeScene)
    duo.timeline = s.timeline
    const dt = lintScene(duo).map(i => i.text)
    expect(dt.some(t => t.includes("'b' ни разу не говорит"))).toBe(true)
    expect(dt.some(t => t.includes('подряд'))).toBe(true)
  })
  it('бюджет узлов: один кот — на ~55 узлов меньше, раскладка считает одного', () => {
    const duo = { ...clone(demoPitCircleScene), characters: { a: PIT, b: demoOfficeScene.characters.b } }
    const diff = sceneNodeBudget(duo) - sceneNodeBudget(demoPitCircleScene)
    expect(diff).toBeGreaterThan(40)
    expect(diff).toBeLessThan(80)
    const br = sceneNodeBreakdown(demoPitCircleScene)
    expect(br.characters).toBeLessThan(sceneNodeBreakdown(duo).characters)
    expect(br.total).toBe(sceneNodeBudget(demoPitCircleScene))
  })
  it('статичная разметка: один кот по центру, data-who="b" нет', () => {
    const html = sceneStaticMarkup(normalizeSceneV2(demoPitCircleScene), null, -1)
    expect(html.match(/data-who="a"/g)).toHaveLength(1)
    expect(html).not.toContain('data-who="b"')
    expect(html).toContain(`translate(${CAT_PLACEMENT.solo.x} ${CAT_PLACEMENT.solo.y})`)
    expect(html.match(/data-mouth="closed"/g)).toHaveLength(1)
  })
  it('легенда описывает одиночную сцену и Пита', () => {
    const text = sceneLegendText()
    expect(text).toContain('characters: { a } БЕЗ поля b')
    expect(text).toContain('кружок Пита')
    expect(text).toContain('## Пример одиночной сцены')
    const l = sceneLegend()
    expect(l.pit).toBe(PIT)
    expect(isSolo(l.soloExample)).toBe(true)
  })
})
