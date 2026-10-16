import { describe, it, expect } from 'vitest'
import { buildSceneRows, sceneBase, rowStatus, parseRuleLine } from './sceneRows.js'
import { fixtureNodes, sceneNode, textNode } from './sceneTabFixtures.js'
import { demoPitCircleScene, demoOfficeScene, demoTemplateScene } from '../../scene/v2/demoScenes.js'

describe('buildSceneRows — список сцен урока', () => {
  it('берёт только ноды scene, по порядку seq, даже если массив перемешан', () => {
    const nodes = fixtureNodes().reverse()
    const { rows } = buildSceneRows(nodes, { title: 'try' })
    expect(rows.map(r => r.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(rows.map(r => r.seq)).toEqual([1, 3, 5, 7])
  })

  it('нет сцен → пусто, сводка нулевая, правила не гоняются', () => {
    const r = buildSceneRows([textNode('t', 1)], { title: 'try' })
    expect(r.rows).toEqual([])
    expect(r.issues).toEqual([])
    expect(r.summary).toMatchObject({ total: 0, dynamic: 0, static: 0 })
    expect(buildSceneRows(null).rows).toEqual([])
  })

  it('динамичная (есть vars) и статичная; слова, тип выбора, запасное слово', () => {
    const { rows, summary } = buildSceneRows(fixtureNodes(), { title: 'try' })
    const [pit, office, tpl] = rows.map(r => r.base)
    expect(pit.kind).toBe('static')
    expect(office.kind).toBe('static')
    expect(tpl.kind).toBe('dynamic')
    expect(tpl.vars).toEqual([{ name: 'food', pick: 'weak', pickText: 'новые', levels: [1], fallback: 'a sandwich' }])
    expect(summary).toMatchObject({ total: 4, dynamic: 1, static: 3 })
  })

  it('предпросмотр реплик: статичная — реальный текст, динамичная — шаблон с {словом} и запасным', () => {
    const { rows } = buildSceneRows(fixtureNodes(), { title: 'try' })
    expect(rows[0].base.lines).toHaveLength(2)
    expect(rows[0].base.lines[0].parts).toEqual([{ text: demoPitCircleScene.timeline[0].text }])
    const tpl = rows[2].base.lines[0]
    expect(tpl.parts).toEqual([{ text: 'Can I have ' }, { slot: 'food', word: 'a sandwich' }, { text: ', please?' }])
  })

  it('solo (Пит), режим показа, число реплик, запуск, превью-сцена', () => {
    const { rows } = buildSceneRows(fixtureNodes(), { title: 'try' })
    expect(rows[0].base).toMatchObject({ solo: true, mode: 'circle', lineCount: 2, start: 'auto' })
    expect(rows[1].base).toMatchObject({ solo: false, mode: 'bubble', lineCount: demoOfficeScene.timeline.length })
    expect(rows[2].base.preview.vars).toBeUndefined() // превью — запасные слова подставлены
    const manual = sceneBase(sceneNode('x', 1, demoOfficeScene, { start: 'manual' }).typeData.scene)
    expect(manual.start).toBe('manual')
  })

  it('озвучка: нет / часть', () => {
    const none = sceneBase(sceneNode('x', 1, demoOfficeScene).typeData.scene).voice
    expect(none).toMatchObject({ kind: 'none', text: 'нет озвучки' })
    expect(sceneBase(sceneNode('x', 1, { ...demoOfficeScene, timeline: [] }).typeData.scene).voice.kind).toBe('none')
  })

  it('пустая и битая нода: состояние empty / broken, статус err', () => {
    const empty = { ...sceneNode('e', 1, null), typeData: { scene: { scene: null, mode: 'bubble' } } }
    const broken = sceneNode('b', 2, { version: 2, title: 'Сломана', timeline: 'нет' })
    const { rows, summary } = buildSceneRows([empty, broken])
    expect(rows[0].base.state).toBe('empty')
    expect(rows[1].base.state).toBe('broken')
    expect(rows.map(rowStatus)).toEqual(['err', 'err'])
    expect(summary.empty).toBe(1)
    expect(summary.withErr).toBe(2)
  })

  it('линтер сцены попадает в errors/warns строки', () => {
    const noTitle = sceneNode('x', 1, { ...demoOfficeScene, title: '' })
    const base = sceneBase(noTitle.typeData.scene)
    expect(base.errors.length).toBeGreaterThan(0)
    expect(base.title).toBe('Без названия')
  })
})

describe('правила сцен S1–S8 в строках', () => {
  it('урок-слово: нарушение S1 (открывает не кружок Пита) попадает в строку и сводку', () => {
    const nodes = [sceneNode('a', 1, demoOfficeScene), textNode('t', 2), sceneNode('b', 3, demoOfficeScene)]
    const { rows, issues, summary } = buildSceneRows(nodes, { title: 'try' })
    const s1 = issues.filter(i => i.code === 'R-scene-open')
    expect(s1.length).toBeGreaterThan(0)
    expect(s1[0].level).toBe('error')
    expect(s1[0].seq).toBe(1) // номер ноды для списка «почему»
    expect(rows[0].issues.some(i => i.code === 'R-scene-open')).toBe(true)
    expect(summary.ruleErrors).toBeGreaterThan(0)
    expect(rowStatus(rows[0])).toBe('err')
  })

  it('Старт/Финал (заголовок не слово) правилами не затрагивается', () => {
    const nodes = [sceneNode('a', 1, demoOfficeScene)]
    expect(buildSceneRows(nodes, { title: 'Финал' }).issues).toEqual([])
  })

  it('без заголовка правила мягкие (предупреждения)', () => {
    const { issues } = buildSceneRows([sceneNode('a', 1, demoOfficeScene)], {})
    expect(issues.every(i => i.level === 'warn')).toBe(true)
  })

  it('parseRuleLine разбирает строку линтера', () => {
    expect(parseRuleLine('[R-scene-count] n1 (scene): ошибка — S2: плохо')).toEqual({ code: 'R-scene-count', ref: 'n1', level: 'error', text: 'S2: плохо' })
    expect(parseRuleLine('мусор')).toBeNull()
  })
})

describe('кэш по сцене', () => {
  it('одна и та же нода → тот же base (ссылка), правка соседа не пересчитывает', () => {
    const nodes = fixtureNodes()
    const a = buildSceneRows(nodes, { title: 'try' }).rows
    const moved = nodes.map(n => (n.id === 'n2' ? { ...n, x: 999 } : n))
    const b = buildSceneRows(moved, { title: 'try' }).rows
    expect(b[0].base).toBe(a[0].base)
    expect(b[1].base).toBe(a[1].base)
  })

  it('смена режима ноды при той же сцене пересчитывает base', () => {
    const n = sceneNode('x', 1, demoTemplateScene)
    const a = sceneBase(n.typeData.scene)
    const b = sceneBase({ ...n.typeData.scene, mode: 'circle' })
    expect(b).not.toBe(a)
    expect(b.mode).toBe('circle')
  })
})
