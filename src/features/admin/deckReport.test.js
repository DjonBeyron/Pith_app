import { describe, it, expect } from 'vitest'
import { buildDeckReport } from './deckReport.js'

const card = () => ({ id: Math.random().toString(), nodes: [{ id: 'n' }] })

describe('отчёт по колодам', () => {
  const curricula = [
    { id: 'm1', title: 'I am trying', lesson_ids: ['s1', 'l-try', 'l-am', 'f1'] },
    { id: 'm2', title: 'Trying again', lesson_ids: ['s2', 'l-try2', 'f2'] },
    { id: 'pro', title: 'Про', lesson_ids: ['p1'] },
  ]
  const lessons = [
    { id: 's1', title: 'Старт' }, { id: 'f1', title: 'Финал' },
    { id: 's2', title: 'Старт' }, { id: 'f2', title: 'Финал' },
    { id: 'l-try', title: 'trying', cards: [card(), card()] },
    { id: 'l-try2', title: 'Trying', cards: [card()] },
    { id: 'l-am', title: 'am', cards: [] },
    { id: 'p1', title: 'Урок 1', cards: [] },
  ]

  it('слово = ключ, колода — сумма карточек всех его уроков', () => {
    const r = buildDeckReport(curricula, lessons)
    const trying = r.find(x => x.word === 'trying')
    expect(trying.cards).toBe(3)
    expect(trying.status).toBe('ok')
    expect(trying.lessons.map(l => l.moduleTitle)).toEqual(['I am trying', 'Trying again'])
  })

  it('Старт/Финал и модули без середины не считаются; проблемные — первыми', () => {
    const r = buildDeckReport(curricula, lessons)
    expect(r.map(x => x.word)).toEqual(['am', 'trying'])
    expect(r[0].status).toBe('none')
  })

  it('кириллица — не слово', () => {
    const r = buildDeckReport(
      [{ id: 'm', title: 'x', lesson_ids: ['s', 't', 'f'] }],
      [{ id: 't', title: 'Таблицы', cards: [] }],
    )
    expect(r).toEqual([])
  })
})
