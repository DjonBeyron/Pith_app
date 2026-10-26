import { describe, it, expect } from 'vitest'
import { normalizeSceneV2, validateSceneV2, parseSceneV2, sceneNodeBudget, NODE_BUDGET } from './sceneSchemaV2.js'
import { lintScene } from './sceneLint.js'
import { demoMascotScene, DEMO_SCENES } from './demoScenes.js'
import { sceneStaticMarkup } from './staticMarkup.js'
import { sceneLegendText } from './sceneLegend.js'
import { setMouth, createMouthDriver } from './mouthDriver.js'

const clone = o => JSON.parse(JSON.stringify(o))

describe('сцена с маскотами: схема', () => {
  it('демо «Кит и Мия» валидна, без ошибок линтера и в бюджете; входит в шаблоны', () => {
    expect(validateSceneV2(demoMascotScene)).toEqual([])
    expect(lintScene(demoMascotScene).filter(f => f.level === 'error')).toEqual([])
    expect(lintScene(demoMascotScene).filter(f => /эмоц|оба персонажа/.test(f.text))).toEqual([])
    expect(sceneNodeBudget(demoMascotScene)).toBeLessThanOrEqual(NODE_BUDGET)
    expect(DEMO_SCENES).toContain(demoMascotScene)
  })

  it('нормализация: skin, переключатели по умолчанию true, имя и пол из маскота; у обычного кота полей нет', () => {
    const s = normalizeSceneV2({ characters: { a: { skin: 'kit' }, b: { gender: 'female' } }, timeline: [] })
    expect(s.characters.a).toMatchObject({ skin: 'kit', gender: 'male', name: 'Кит', pupilReaction: true, extraFace: true })
    expect(s.characters.b.skin).toBeUndefined()
    expect(s.characters.b.pupilReaction).toBeUndefined()
    expect(normalizeSceneV2({ characters: { a: { skin: 'mia', pupilReaction: false } } }).characters.a).toMatchObject({ pupilReaction: false, extraFace: true })
    expect(normalizeSceneV2({ characters: { a: { skin: 'zzz' } } }).characters.a.skin).toBeUndefined()
  })

  it('нормализация реплик: face / react сохраняются только строками', () => {
    const s = normalizeSceneV2({ timeline: [{ who: 'a', text: 'x', face: 'shy', react: 5 }, { who: 'b', text: 'y', face: '' }] })
    expect(s.timeline[0]).toMatchObject({ face: 'shy' })
    expect(s.timeline[0].react).toBeUndefined()
    expect(s.timeline[1].face).toBeUndefined()
  })

  it('валидатор: неизвестный skin, не-булевы переключатели', () => {
    const s = clone(demoMascotScene)
    s.characters.a.skin = 'dog'; s.characters.b.pupilReaction = 'yes'
    const e = validateSceneV2(s)
    expect(e.some(x => x.startsWith('characters.a.skin'))).toBe(true)
    expect(e.some(x => x.startsWith('characters.b.pupilReaction'))).toBe(true)
  })

  it('валидатор: лицо должно быть из состояний маскота этого персонажа', () => {
    const s = clone(demoMascotScene)
    s.timeline[0].face = 'roll' // лицо Мии у Кита
    s.timeline[1].react = 'love' // у Кита это есть, а говорит Мия — реакция Кита, ок
    s.timeline[2].face = 5
    const e = validateSceneV2(s)
    expect(e.filter(x => x.startsWith('timeline[0].face'))).toHaveLength(1)
    expect(e.some(x => x.startsWith('timeline[1].react'))).toBe(false)
    expect(e.some(x => x.startsWith('timeline[2].face — строка'))).toBe(true)
  })

  it('валидатор: лицо у обычного кота и реакция в одиночной сцене — ошибки', () => {
    const s = clone(demoMascotScene)
    delete s.characters.a.skin
    expect(validateSceneV2(s).some(x => x.startsWith('timeline[0].face') && /нет маскота/.test(x))).toBe(true)
    const solo = { ...clone(demoMascotScene), characters: { a: clone(demoMascotScene.characters.a) }, timeline: [{ who: 'a', text: 'Hi!', emotion: 'neutral', react: 'shy' }, { who: 'a', text: 'Yo!', emotion: 'neutral' }] }
    expect(validateSceneV2(solo).some(x => /слушателя нет/.test(x))).toBe(true)
  })

  it('парсер из JSON сохраняет маскотов и лица', () => {
    const { scene, errors } = parseSceneV2(JSON.stringify(demoMascotScene))
    expect(errors).toEqual([])
    expect(scene.characters.b.skin).toBe('mia')
    expect(scene.timeline[2].face).toBe('love')
  })
})

describe('сцена с маскотами: линтер и бюджет', () => {
  it('лицо задано, а extraFace выключен — предупреждение', () => {
    const s = clone(demoMascotScene); s.characters.a.extraFace = false
    expect(lintScene(s).some(f => f.level === 'warn' && /extraFace/.test(f.text))).toBe(true)
  })
  it('оба маскота одного скина — предупреждение; фиолетовый и серый — нет «котов не отличить»', () => {
    const s = clone(demoMascotScene); s.characters.b.skin = 'kit'
    expect(lintScene(s).some(f => /оба персонажа — маскот/.test(f.text))).toBe(true)
  })
  it('бюджет считает самое тяжёлое лицо из реплик: не меньше, чем у обычного лица', () => {
    const plain = clone(demoMascotScene); for (const l of plain.timeline) { delete l.face; delete l.react }
    expect(sceneNodeBudget(demoMascotScene)).toBeGreaterThanOrEqual(sceneNodeBudget(plain))
    const off = clone(demoMascotScene); off.characters.a.extraFace = false; off.characters.b.extraFace = false
    expect(sceneNodeBudget(off)).toBe(sceneNodeBudget(plain))
  })
})

describe('сцена с маскотами: статичный кадр и рот', () => {
  const scene = normalizeSceneV2(demoMascotScene)
  it('кадр реплики показывает лицо говорящего и реакцию слушающего', () => {
    const h0 = sceneStaticMarkup(scene, scene.timeline[0], 0) // Кит shy, Мия pathos
    expect(h0).toContain('data-face="shy"'); expect(h0).toContain('data-face="pathos"')
    const h1 = sceneStaticMarkup(scene, scene.timeline[1], 1) // Мия roll, Кит pretend
    expect(h1).toContain('data-face="roll"'); expect(h1).toContain('data-face="pretend"')
  })
  it('без реплики — обычные лица; extraFace выключен — обычные в любой реплике', () => {
    expect(sceneStaticMarkup(scene, null, -1)).not.toMatch(/data-face="(shy|pathos)"/)
    const off = normalizeSceneV2({ ...clone(demoMascotScene), characters: { a: { ...demoMascotScene.characters.a, extraFace: false }, b: { ...demoMascotScene.characters.b, extraFace: false } } })
    expect(sceneStaticMarkup(off, off.timeline[0], 0)).not.toMatch(/data-face="(shy|pathos)"/)
  })
  it('драйвер рта пишет формы в узлы рта маскота', () => {
    const nodes = Object.fromEntries(['mm', 'mt', 'mf', 'ml'].map(c => [c, { a: {}, setAttribute(k, v) { this.a[k] = v } }]))
    const attrs = { 'data-skin': 'kit', 'data-face': 'base', 'data-mouth': 'closed' }
    const el = { getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v }, querySelector: s => nodes[s.slice(1)] }
    setMouth(el, 'open')
    expect(attrs['data-mouth']).toBe('open')
    expect(nodes.mm.a.d).toBeTruthy()
    const shapes = []
    createMouthDriver(sh => shapes.push(sh), { setInterval: () => 1, clearInterval: () => {} }).start()
    expect(shapes).toEqual(['open'])
  })
})

describe('легенда для нейросети', () => {
  it('полная — про skin, face, react и правило; компактная (автор урока) без них', () => {
    const full = sceneLegendText()
    expect(full).toContain('characters.*.skin'); expect(full).toContain('timeline[].face'); expect(full).toContain('timeline[].react')
    expect(full).toContain('закатила глаза'); expect(full).toContain('Сцена с маскотами')
    const compact = sceneLegendText({ compact: true })
    expect(compact).not.toContain('characters.*.skin'); expect(compact).not.toContain('timeline[].face'); expect(compact).not.toContain('Сцена с маскотами')
  })
})
