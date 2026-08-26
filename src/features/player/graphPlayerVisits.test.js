import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { appendVisit, forgetNodeKeys } from './graphPlayerVisits.js'
import { pickPanelNodes } from './usePlayerPanelNodes.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const table = { id: 'tbl', seq: 1, type: 'table', typeData: { table: { mode: 'manual' } } }
const hint  = { id: 'hint', seq: 2, type: 'text', typeData: { text: { content: 'подсказка' } } }

describe('возврат на ту же ноду (ошибся → подсказка → снова вопрос)', () => {
  it('нода снова становится последней — панель ответа открывается', () => {
    let visible = appendVisit([], table, 1)
    visible = appendVisit(visible, hint, 1)
    expect(pickPanelNodes(visible).table).toBe(null)   // последней стоит подсказка

    visible = appendVisit(visible, table, 2)
    expect(visible.map(n => n.id)).toEqual(['hint', 'tbl'])
    expect(pickPanelNodes(visible).table?.id).toBe('tbl')
  })

  it('дубликатов в ленте не появляется', () => {
    let visible = appendVisit([], table, 1)
    visible = appendVisit(visible, table, 2)
    visible = appendVisit(visible, table, 3)
    expect(visible).toHaveLength(1)
    expect(visible[0].visit).toBe(3)
  })

  it('номер показа едет в ключ панели — она пересобирается с чистого листа', () => {
    const panels = read('./PlayerPanels.jsx')
    expect(panels).toContain('key={`${tableNode.id}:${epoch}:${tableNode.visit ?? 0}`}')
    const graph = read('./useGraphPlayer.js')
    expect(graph).toContain('visitsRef.current.set(next.id, visit)')
    expect(graph).toContain('visit: n.visit')
  })

  it('сработавшие триггеры ноды забываются — второй заход снова ведёт дальше', () => {
    const fired = new Set(['tbl:table_wrong', 'tbl:timer', 'hint:timer'])
    const next = forgetNodeKeys(fired, 'tbl')
    expect([...next]).toEqual(['hint:timer'])
    // исходный набор не мутируем
    expect(fired.size).toBe(3)
  })

  it('чужие ноды с похожим началом id не задеваются', () => {
    const fired = new Set(['tbl:done', 'tbl2:done'])
    expect([...forgetNodeKeys(fired, 'tbl')]).toEqual(['tbl2:done'])
  })

  it('счётчик показов сбрасывается при новом запуске урока', () => {
    expect(read('./useGraphPlayer.js')).toContain('visitsRef.current = new Map()')
  })
})

describe('право на ошибку в таблице', () => {
  const panel = read('./panels/table-manual/TableManualPanel.jsx')

  it('триггер «неверно» уходит только с третьей ошибки', () => {
    expect(panel).toContain('wrongCount.current += 1')
    expect(panel).toContain('if (wrongCount.current >= 3) {')
    expect(panel).toContain("closePanelWith('table_wrong', variantId)")
  })

  it('первые две ошибки только показывают разбор и дают попробовать снова', () => {
    expect(panel).toContain('const id = setTimeout(() => setResult(null), 700)')
  })
})
