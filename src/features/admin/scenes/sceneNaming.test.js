import { describe, it, expect } from 'vitest'
import {
  typeTitle, cleanTitle, slugify, isAutoId, retitle, copyTitle, asCopy, fromTemplate, titleProblem, sceneStatusLabel,
  duplicateTitles, isDuplicateTitle, shortRef, TITLE_MAX, NO_TITLE,
} from '../../scene/v2/sceneNaming.js'
import { validateSceneV2 } from '../../scene/v2/sceneValidate.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { demoOfficeScene, DEMO_SCENES } from '../../scene/v2/demoScenes.js'
import { newDraft, setTitle } from './builderModel.js'
import { templateList, templateScene } from './ui/sceneTemplates.js'

// Название и служебный id сцены: одно редактируемое название (1–80), id — автоматический slug, «Сохранить как…»
// без накопления «-copy-copy», шаблоны с осмысленным именем, старые сцены со странным id остаются валидными.
describe('название сцены', () => {
  it('ввод: переводы строк и табы → пробел, повторные пробелы схлопываются, ведущие убираются, хвостовой остаётся при наборе', () => {
    expect(typeTitle('  Кофе\n\tбрейк   дня ')).toBe('Кофе брейк дня ')
    expect(cleanTitle('  Кофе\n\tбрейк   дня ')).toBe('Кофе брейк дня')
  })
  it('длина 1–80: длиннее обрезается, пусто — «нет названия» и ошибка линтера', () => {
    expect(cleanTitle('я'.repeat(200))).toHaveLength(TITLE_MAX)
    expect(titleProblem('   ')).toMatch(/введите название/)
    expect(titleProblem('Кофе')).toBeNull()
    const bad = { ...normalizeSceneV2(demoOfficeScene), title: '   ' }
    expect(lintScene(bad).some(x => x.level === 'error' && x.text.startsWith('title —'))).toBe(true)
    expect(lintScene(normalizeSceneV2(demoOfficeScene)).some(x => x.text.startsWith('title —'))).toBe(false)
  })
  it('валидатор допускает 80 символов и не допускает 81 (старые 60 остаются валидными)', () => {
    const base = normalizeSceneV2(demoOfficeScene)
    expect(validateSceneV2({ ...base, title: 'а'.repeat(80) })).toEqual([])
    expect(validateSceneV2({ ...base, title: 'а'.repeat(81) }).join()).toMatch(/title/)
    expect(validateSceneV2({ ...base, title: 'а'.repeat(60) })).toEqual([])
  })
  it('нормализация чинит название на лету (пробелы, длина)', () => {
    expect(normalizeSceneV2({ ...demoOfficeScene, title: '  Про   работу \n' }).title).toBe('Про работу')
    expect(normalizeSceneV2({ ...demoOfficeScene, title: 'я'.repeat(120) }).title).toHaveLength(80)
  })
})

describe('служебный id', () => {
  it('slug от названия: транслитерация, дефисы, ≤ 40, пусто → scene', () => {
    expect(slugify('Кофе-брейк!')).toBe('kofe-breyk')
    expect(slugify('Про работу')).toBe('pro-rabotu')
    expect(slugify('Hello, World 2')).toBe('hello-world-2')
    expect(slugify('Щётка Ёж')).toBe('schetka-ezh')
    expect(slugify('???')).toBe('scene')
    expect(slugify('я'.repeat(100)).length).toBeLessThanOrEqual(40)
    expect(validateSceneV2({ ...normalizeSceneV2(demoOfficeScene), id: slugify('Кофе-брейк!') })).toEqual([])
  })
  it('id идёт за названием, пока он автоматический (заглушка или slug прежнего названия)', () => {
    const d = newDraft()
    expect(d.id).toBe('new-scene')
    const a = setTitle(d, 'Кофе')
    expect(a.id).toBe('kofe')
    expect(setTitle(a, 'Кофе-брейк').id).toBe('kofe-breyk')
    expect(isAutoId('new-scene', 'x')).toBe(true)
    expect(isAutoId('kofe', 'Кофе')).toBe(true)
  })
  it('старая сцена со странным id: id не трогается при смене названия, сцена валидна', () => {
    const old = normalizeSceneV2({ ...demoOfficeScene, id: 'office-demo-copy-copy', title: 'Старая' })
    expect(validateSceneV2(old)).toEqual([])
    const renamed = retitle(old, 'Новое имя')
    expect(renamed.id).toBe('office-demo-copy-copy')
    expect(renamed.title).toBe('Новое имя')
    expect(validateSceneV2({ ...old, id: 'My_Old-Scene7' })).toEqual([])
  })
  it('пустое название: id остаётся валидным (scene), а не пустым', () => {
    const r = retitle(newDraft(), '')
    expect(r.id).toBe('scene')
    expect(validateSceneV2({ ...normalizeSceneV2(demoOfficeScene), id: r.id })).toEqual([])
  })
})

describe('«Сохранить как…» и копии', () => {
  it('«Название (копия)», повторно — «(копия 2)», «(копия 3)», без накопления', () => {
    expect(copyTitle('Кофе')).toBe('Кофе (копия)')
    expect(copyTitle('Кофе (копия)')).toBe('Кофе (копия 2)')
    expect(copyTitle('Кофе (копия 2)')).toBe('Кофе (копия 3)')
    expect(copyTitle('  ')).toBe(`${NO_TITLE} (копия)`)
    expect(copyTitle('я'.repeat(80))).toHaveLength(TITLE_MAX)
    expect(copyTitle('я'.repeat(80))).toMatch(/\(копия\)$/)
  })
  it('asCopy: новое название и свежий slug-id без «-copy-copy»', () => {
    const src = { ...normalizeSceneV2(demoOfficeScene), id: 'kofe-copy', title: 'Кофе' }
    const c1 = asCopy(src)
    expect(c1.title).toBe('Кофе (копия)')
    expect(c1.id).toBe('kofe-kopiya')
    const c2 = asCopy(c1)
    expect(c2.title).toBe('Кофе (копия 2)')
    expect(c2.id).not.toMatch(/copy.*copy|kopiya.*kopiya/)
    expect(validateSceneV2(c2)).toEqual([])
  })
})

describe('шаблоны', () => {
  it('при загрузке получают осмысленное имя и свой id без «-copy»', () => {
    const list = templateList()
    for (const t of list) {
      const s = templateScene(t)
      expect(cleanTitle(s.title)).not.toBe('')
      expect(s.id).not.toMatch(/copy/)
      expect(validateSceneV2(normalizeSceneV2(s))).toEqual([])
    }
    expect(fromTemplate(list.at(-1)).title).toBe('Новая сцена')
    expect(fromTemplate(list[0]).title).toBe(DEMO_SCENES[0].title)
  })
})

describe('статус и повторяющиеся названия', () => {
  it('статус шапки: Новая / Черновик / Опубликована + « · не сохранена»', () => {
    expect(sceneStatusLabel({ saved: { id: null }, dirty: true })).toBe('Новая · не сохранена')
    expect(sceneStatusLabel({ saved: { id: 'a', status: 'draft' }, dirty: false })).toBe('Черновик')
    expect(sceneStatusLabel({ saved: { id: 'a', status: 'draft' }, dirty: true })).toBe('Черновик · не сохранена')
    expect(sceneStatusLabel({ saved: { id: 'a', status: 'published' }, dirty: false })).toBe('Опубликована')
    expect(sceneStatusLabel({ saved: { id: 'a', status: 'published' }, dirty: true })).toBe('Опубликована · не сохранена')
  })
  it('одинаковые названия допустимы; повторы находятся без учёта регистра и пробелов, у строки есть короткий код', () => {
    const rows = [{ id: 'aaaa-1111', title: 'Кофе' }, { id: 'bbbb-2222', title: ' кофе ' }, { id: 'cccc-3333', title: 'Офис' }]
    const dups = duplicateTitles(rows)
    expect(isDuplicateTitle(dups, 'Кофе')).toBe(true)
    expect(isDuplicateTitle(dups, 'Офис')).toBe(false)
    expect(shortRef('bbbb-2222')).toBe('2222')
  })
  it('подпись в списках не показывает сырой id: сцена без названия — «Сцена»', async () => {
    const { sceneSummary } = await import('../../scene/v2/sceneNode.js')
    expect(sceneSummary({ id: 'new-scene', title: '', timeline: [{}, {}] })).toBe('Сцена · 2 реплики')
  })
})
