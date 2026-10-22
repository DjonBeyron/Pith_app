import { describe, it, expect } from 'vitest'
import { planSync, syncIsEmpty, syncSummary } from './rulesSync.js'

const db = (o = {}) => ({ id: 'd1', text: 'Старый текст правила про тире', title: 'Тире', group: 'Тон', checker: 'auto', severity: 'warn', bad: '', good: '', category: 'principle', ...o })
const seed = (o = {}) => ({ text: 'Новый текст правила про тире: не ставь его в репликах', title: 'Тире', group: 'Тон и общение', checker: 'auto', severity: 'warn', bad: 'b', good: 'g', category: 'principle', ...o })

describe('план синхронизации правил со стандартом', () => {
  it('совпадение по названию: обновляются только отличающиеся поля', () => {
    const p = planSync([db()], [seed()])
    expect(p.patch).toEqual([{ id: 'd1', fields: { text: 'Новый текст правила про тире: не ставь его в репликах', group: 'Тон и общение', bad: 'b', good: 'g' } }])
    expect(p.create).toEqual([]); expect(p.remove).toEqual([])
  })
  it('без названия — по началу текста; нет совпадения — создать; снятое — убрать; чужое правило автора не трогаем', () => {
    const rows = [db({ id: 'a', title: '', text: 'Новый текст правила про тире: не ставь его в репликах, вообще' }), db({ id: 'b', title: 'Старое слитое' }), db({ id: 'c', title: 'Моё правило' })]
    const p = planSync(rows, [seed(), seed({ title: 'Новое', text: 'Совсем новое' })], ['Старое слитое'])
    expect(p.patch.map(x => x.id)).toEqual(['a'])
    expect(p.create.map(x => x.title)).toEqual(['Новое'])
    expect(p.remove).toEqual([{ id: 'b', title: 'Старое слитое' }])
  })
  it('ничего не делать, если база совпадает; сводка', () => {
    const p = planSync([db(seed({ id: 'd1' }))], [seed()])
    expect(syncIsEmpty(p)).toBe(true)
    expect(syncSummary({ patch: [1, 2], create: [], remove: [1] })).toBe('обновить 2 · убрать 1')
  })
})
