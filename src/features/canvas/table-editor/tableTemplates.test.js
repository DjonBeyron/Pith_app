import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizeTable, setCellOptions, cellOptions } from './tableGridUtils.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Шаблон едет на сервер как jsonb — то есть через JSON.stringify/parse
const roundTrip = t => JSON.parse(JSON.stringify(t))

const table = () => ({
  rowCount: 2, colCount: 2,
  columns: [{ id: 'k1', widthPct: 50 }, { id: 'k2', widthPct: 50 }],
  rows: [{ id: 'r1', heightPct: 50 }, { id: 'r2', heightPct: 50 }],
  cells: [
    { id: 'c1', row: 0, col: 0, rowspan: 1, colspan: 2, value: 'he/she/it', isHeader: true, fontSize: 11 },
    { id: 'c2', row: 1, col: 0, rowspan: 1, colspan: 1, value: 'is' },
    { id: 'c3', row: 1, col: 1, rowspan: 1, colspan: 1, value: '' },
  ],
})

describe('шаблон таблицы переживает поездку на сервер', () => {
  it('наполнение выпадающего меню ячейки сохраняется', () => {
    const saved = roundTrip(setCellOptions(table(), 'c1', ['he', 'she', 'it']))
    const applied = normalizeTable(saved)
    expect(cellOptions(applied.cells.find(c => c.id === 'c1'))).toEqual(['he', 'she', 'it'])
  })

  it('объединения, заголовки и размеры текста сохраняются', () => {
    const applied = normalizeTable(roundTrip(table()))
    const c1 = applied.cells.find(c => c.id === 'c1')
    expect([c1.colspan, c1.isHeader, c1.fontSize]).toEqual([2, true, 11])
  })

  it('пропорции колонок и строк сохраняются', () => {
    const applied = normalizeTable(roundTrip(table()))
    expect(applied.columns.map(c => c.widthPct)).toEqual([50, 50])
    expect(applied.rows.map(r => r.heightPct)).toEqual([50, 50])
  })
})

describe('шаблоны лежат на сервере, а не в браузере', () => {
  it('бар берёт список через хук с сервера, localStorage не трогает', () => {
    const bar = read('./TableTemplatesBar.jsx')
    expect(bar).toContain("useTableTemplates()")
    expect(bar).not.toContain('localStorage')
  })

  it('в БД колонка называется data (table — слово SQL), наружу отдаётся table', () => {
    const api = read('../../../shared/api/tableTemplatesApi.js')
    expect(api).toContain("from('table_templates')")
    expect(api).toContain('({ id: row.id, name: row.name, table: row.data })')
    expect(api).toContain('insert({ name, data: table })')
  })

  it('старые локальные шаблоны разово переезжают на сервер и стираются', () => {
    const hook = read('./useTableTemplates.js')
    expect(hook).toContain('readLegacyTemplates()')
    expect(hook).toContain('clearLegacyTemplates()')
  })

  it('есть миграция с RLS только для админа', () => {
    const sql = read('../../../../supabase/migrations/20260825120000_table_templates.sql')
    expect(sql).toContain('create table if not exists public.table_templates')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('using (public.is_admin())')
  })
})

describe('меню клипа таймлайна видно поверх редактора', () => {
  it('z-index выше оверлея редактора таблицы (портал в body)', () => {
    const clip  = read('../../../styles/canvas/clip-menu.css')
    const modal = read('../../../styles/canvas/table-editor-modal.css')
    const zOf = (css, sel) => {
      const block = css.slice(css.indexOf(sel))
      return Number(block.match(/z-index:\s*(\d+)/)[1])
    }
    expect(zOf(clip, '.clipMenu {')).toBeGreaterThan(zOf(modal, '.tableEditorOverlay {'))
    expect(zOf(clip, '.clipMenuOverlay {')).toBeGreaterThan(zOf(modal, '.tableEditorOverlay {'))
  })
})

describe('текст в ячейке конструктора стоит по центру', () => {
  it('высоту поля подгоняют под текст, а ячейка центрирует его', () => {
    const cell = read('./TableBuilderCell.jsx')
    expect(cell).toContain('el.scrollHeight')
    expect(cell).toContain('ResizeObserver')
    const css = read('../../../styles/canvas/table-editor-builder.css')
    const block = css.slice(css.indexOf('.tableBuilderCell {'), css.indexOf('.tableBuilderCellSelected'))
    expect(block).toContain('align-items: center')
    expect(css).not.toContain('.tableBuilderCellInput {\n  flex: 1;')
  })
})
