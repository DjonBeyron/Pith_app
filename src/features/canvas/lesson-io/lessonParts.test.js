import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { buildLegend } from './lessonSchema.js'
import {
  ALL_PARTS, normalizeParts, peekParts, principlesForParts, exportFileName, parsedSummary, partsAbout,
} from './lessonParts.js'
import { normalizeWordCard } from '../../wordCard/wordCardModel.js'
import { copyNodesForCard } from '../../reviewCards/reviewCardCopy.js'

// Три части файла урока-слова (урок / карточки повтора / справка): в обе стороны едут
// одним файлом или по отдельности; легенда несёт только то, что нужно выбранным частям

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const nodes = () => [
  { id: 'a', seq: 1, x: 0, y: 0, type: 'text', typeData: { text: { content: 'Привет' } }, triggers: [] },
]
const cards = () => [{ id: 'c1', nodes: copyNodesForCard(nodes(), ['a']) }]
const wordCard = () => normalizeWordCard({
  tag: 'глагол',
  nodes: [{ type: 'text', text: '**try** — пытаться' }, { type: 'dialog', lines: [{ side: 'l', text: 'I’m not trying', tr: 'Я не пытаюсь', neg: true }] }],
})
const all = () => ({ title: 'trying', zones: [{ id: 'z', x: 0, y: 0, width: 10, height: 10 }], reviewCards: cards(), wordCard: wordCard() })

describe('экспорт по частям', () => {
  it('без parts — все три части, как раньше', () => {
    const out = exportLesson(nodes(), all())
    expect(out.nodes).toHaveLength(1)
    expect(out.reviewCards).toHaveLength(1)
    expect(out.wordCard.nodes).toHaveLength(2)
    expect(out.zones).toHaveLength(1)
    expect(out.lesson.nodeCount).toBe(1)
  })

  it('только справка: ни nodes, ни зон, ни колоды; в заголовке нет nodeCount', () => {
    const out = exportLesson(nodes(), { ...all(), parts: { lesson: false, reviewCards: false } })
    expect(out.nodes).toBeUndefined()
    expect(out.zones).toBeUndefined()
    expect(out.reviewCards).toBeUndefined()
    expect(out.wordCard.tag).toBe('глагол')
    expect(out.lesson).toEqual({ title: 'trying' })
  })

  it('только колода: нужны и описание нод, и описание колоды — но не справки', () => {
    const out = exportLesson(nodes(), { ...all(), parts: { lesson: false, wordCard: false } })
    expect(out.nodes).toBeUndefined()
    expect(out.reviewCards).toHaveLength(1)
    expect(Object.keys(out.legend)).toEqual(expect.arrayContaining(['node', 'nodes', 'triggers', 'reviewCards']))
    expect(out.legend.wordCard).toBeUndefined()
    expect(out.legend.zones).toBeUndefined()
  })

  it('только урок: колоды и справки в файле нет, их описаний в легенде тоже', () => {
    const out = exportLesson(nodes(), { ...all(), parts: { reviewCards: false, wordCard: false } })
    expect(out.nodes).toHaveLength(1)
    expect(out.reviewCards).toBeUndefined()
    expect(out.wordCard).toBeUndefined()
    expect(out.legend.reviewCards).toBeUndefined()
    expect(out.legend.wordCard).toBeUndefined()
    expect(out.legend.preSubmitChecklist).toBeDefined()
  })

  it('пустая, но отмеченная часть: в файле её нет, а описание в легенде есть — модель сможет написать', () => {
    const out = exportLesson(nodes(), { title: 'x', wordCard: null, parts: { reviewCards: false } })
    expect(out.wordCard).toBeUndefined()
    expect(out.legend.wordCard.about).toMatch(/Справка слова/)
  })

  it('справка без легенды чистая и маленькая: правила — только про wordCard', () => {
    const principles = ['Правило про nodes', 'Урок-слово отдаёт справку wordCard: …', 'Колода reviewCards: …']
    const legend = buildLegend(principles, ['пункт'], normalizeParts({ lesson: false, reviewCards: false }))
    expect(legend.principles).toEqual(['Урок-слово отдаёт справку wordCard: …'])
    expect(legend.parts).toMatch(/ТОЛЬКО те части/)
    expect(JSON.stringify(legend).length).toBeLessThan(JSON.stringify(buildLegend(principles)).length / 2)
  })
})

describe('вспомогательное', () => {
  it('principlesForParts: у урока все правила, без урока — по выбранным частям, ничего не выбрано — пусто', () => {
    const p = ['a nodes', 'b reviewCards', 'c wordCard']
    expect(principlesForParts(p, ALL_PARTS)).toEqual(p)
    expect(principlesForParts(p, { lesson: false, reviewCards: true, wordCard: false })).toEqual(['b reviewCards'])
    expect(principlesForParts(p, { lesson: false, reviewCards: false, wordCard: false })).toEqual([])
  })

  it('partsAbout перечисляет, что в файле', () => {
    expect(partsAbout({ lesson: false, reviewCards: false, wordCard: true })).toMatch(/В этом файле: wordCard \(справка слова\)/)
    expect(partsAbout({ lesson: false, reviewCards: false, wordCard: false })).toMatch(/только заголовок/)
  })

  it('exportFileName: все части — просто имя, иначе видно что внутри', () => {
    expect(exportFileName('trying', ALL_PARTS)).toBe('trying.json')
    expect(exportFileName('trying', normalizeParts({ lesson: false, reviewCards: false }))).toBe('trying.wordCard.json')
    expect(exportFileName('trying', normalizeParts({ wordCard: false }))).toBe('trying.lesson+reviewCards.json')
    expect(exportFileName('I’m trying!', ALL_PARTS)).toBe('I_m_trying_.json')
    expect(exportFileName('', normalizeParts({ lesson: false }))).toBe('lesson.reviewCards+wordCard.json')
  })
})

describe('импорт по частям', () => {
  const file = over => ({ ...exportLesson(nodes(), all()), ...over })

  it('peekParts: что лежит в файле; не JSON — null', () => {
    expect(peekParts(JSON.stringify(exportLesson(nodes(), all())))).toEqual({ lesson: 1, reviewCards: 1, wordCard: 2 })
    expect(peekParts({ wordCard: { nodes: [{ type: 'text', text: 'ok' }, { type: 'нет' }] } })).toEqual({ lesson: 0, reviewCards: 0, wordCard: 1 })
    expect(peekParts('{')).toBeNull()
    expect(peekParts('[]')).toBeNull()
    expect(peekParts(null)).toBeNull()
  })

  it('файл только со справкой: урока нет, справка собрана', () => {
    const r = importLesson({ format: 'pithy-lesson', wordCard: { nodes: [{ type: 'text', text: 'ок' }] } })
    expect(r.nodes).toEqual([])
    expect(r.has).toEqual({ lesson: false, reviewCards: false, wordCard: true })
    expect(r.wordCard.nodes).toHaveLength(1)
    expect(r.reviewCards).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('файл только с колодой: карточки собраны без урока', () => {
    const json = exportLesson(nodes(), { reviewCards: cards(), parts: { lesson: false, wordCard: false } })
    const r = importLesson(json)
    expect(r.nodes).toEqual([])
    expect(r.has).toEqual({ lesson: false, reviewCards: true, wordCard: false })
    expect(r.reviewCards).toHaveLength(1)
    expect(r.wordCard).toBeNull()
  })

  it('весь урок одним файлом: все три части и id урока', () => {
    const r = importLesson(file({ lesson: { title: 'trying', lessonId: 'L-1', nodeCount: 1 } }))
    expect(r.has).toEqual({ lesson: true, reviewCards: true, wordCard: true })
    expect(r.nodes).toHaveLength(1)
    expect(r.reviewCards).toHaveLength(1)
    expect(r.wordCard.tag).toBe('глагол')
    expect(r.lessonId).toBe('L-1')
    expect(r.title).toBe('trying')
  })

  it('экспорт по частям → импорт: каждая часть возвращается сама', () => {
    for (const only of ['lesson', 'reviewCards', 'wordCard']) {
      const parts = { lesson: false, reviewCards: false, wordCard: false, [only]: true }
      const r = importLesson(exportLesson(nodes(), { ...all(), parts }))
      expect(r.has).toEqual(parts)
    }
  })

  it('пустой файл и «nodes: []» объясняют, чего не хватает', () => {
    expect(() => importLesson({ format: 'pithy-lesson' })).toThrow(/нет массива nodes/)
    expect(() => importLesson({ nodes: [] })).toThrow(/нет ни reviewCards, ни wordCard/)
  })

  it('parsedSummary: перечисляет только то, что есть', () => {
    expect(parsedSummary(importLesson(file({})))).toBe('1 нод, 0 связей, карточек повтора: 1, справка слова: блоков 2')
    expect(parsedSummary(importLesson({ wordCard: { nodes: [{ type: 'text', text: 'ок' }] } }))).toBe('справка слова: блоков 1')
  })
})
