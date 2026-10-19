import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import TableChatBubble from './modules/table/TableChatBubble.jsx'

const table = {
  rowCount: 2, colCount: 2, columns: [{ id: 'c0', widthPct: 50 }, { id: 'c1', widthPct: 50 }], rows: [{ id: 'r0', heightPct: 50 }, { id: 'r1', heightPct: 50 }],
  cells: [{ id: 'h0', col: 0, row: 0, value: 'Мостик', isHeader: true, colspan: 1, rowspan: 1 }, { id: 'a0', col: 1, row: 0, value: 'to', colspan: 1, rowspan: 1 }],
}
const html = props => renderToStaticMarkup(h(TableChatBubble, { table, nodeId: 'n1', caption: 'выражаем желание', sent: { result: 'correct', words: [] }, ...props }))

describe('шапка авто-таблицы не зеленеет', () => {
  it('в чате: у авто-таблицы нет классов итога, у ручной — прежние', () => {
    expect(html({ auto: true })).not.toContain('tdAssemblyBoxOk')
    expect(html({ auto: false })).toContain('tdAssemblyBoxOk')
    expect(html({ auto: true, sent: { result: 'wrong', words: [] } })).not.toContain('tdAssemblyBoxErr')
  })
  it('в панели диктора: нет Ok/Err, подсветка с заголовков столбцов снята', () => {
    const view = readFileSync(fileURLToPath(new URL('./panels/table-dictator/TableDictatorView.jsx', import.meta.url)), 'utf8')
    expect(view).not.toContain('tdAssemblyBoxOk')
    expect(view).not.toContain("'tdAssemblyBoxErr'")
    expect(view).toContain('highlightedIds={gridHighlighted}')
    expect(view).toContain('c.isHeader')
  })
})
