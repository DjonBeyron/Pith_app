import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setCellOptions, cellOptions } from './tableGridUtils.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const table = () => ({
  rowCount: 1, colCount: 2,
  columns: [{ widthPct: 50 }, { widthPct: 50 }],
  rows: [{ heightPct: 100 }],
  cells: [
    { id: 'c1', row: 0, col: 0, rowspan: 1, colspan: 1, value: 'he/she/it' },
    { id: 'c2', row: 0, col: 1, rowspan: 1, colspan: 1, value: 'is' },
  ],
})

describe('особые значения ячейки', () => {
  it('сохраняются списком, лишние пробелы и пустые строки отбрасываются', () => {
    const t = setCellOptions(table(), 'c1', ['  he ', '', 'she', '   ', 'it'])
    expect(cellOptions(t.cells.find(c => c.id === 'c1'))).toEqual(['he', 'she', 'it'])
  })

  it('сама ячейка выглядит по-прежнему — текст не трогаем', () => {
    const t = setCellOptions(table(), 'c1', ['he', 'she'])
    expect(t.cells.find(c => c.id === 'c1').value).toBe('he/she/it')
  })

  it('пустой список возвращает ячейку в обычные — поле убирается', () => {
    const withOpts = setCellOptions(table(), 'c1', ['he'])
    const cleared  = setCellOptions(withOpts, 'c1', [])
    expect('options' in cleared.cells.find(c => c.id === 'c1')).toBe(false)
    expect(cellOptions(cleared.cells.find(c => c.id === 'c1'))).toEqual([])
  })

  it('соседние ячейки не задеваются', () => {
    const t = setCellOptions(table(), 'c1', ['he'])
    expect(t.cells.find(c => c.id === 'c2')).toEqual(table().cells[1])
  })
})

describe('где особые значения работают', () => {
  it('задаются в конструкторе кнопкой на ячейке', () => {
    expect(read('./TableBuilderCell.jsx')).toContain('className={`tableBuilderOptsBtn')
    expect(read('./TableGridBuilder.jsx')).toContain('<CellOptionsPopover')
    expect(read('./CellOptionsPopover.jsx')).toContain('.map(s => s.trim()).filter(Boolean)')
  })

  it('в авто-режиме вариант выбирает автор на клипе, меню в уроке не появляется', () => {
    const track = read('./TableTimelineTrack.jsx')
    expect(track).toContain('className="tlClipPick"')
    expect(track).toContain('const options  = cell?.options ?? []')
    const raf  = read('../../player/panels/table-dictator/useTableDictatorRaf.js')
    const post = read('../../player/panels/table-dictator/dictatorPostAudio.js')
    for (const src of [raf, post]) {
      expect(src).toContain('const val = (layer.pick ?? cellObj?.value)?.trim()')
      expect(src).not.toContain('CellOptionsMenu')
    }
  })

  it('в ручном режиме тап по ячейке открывает меню вариантов', () => {
    const panel = read('../../player/panels/table-manual/TableManualPanel.jsx')
    expect(panel).toContain('if (options.length) { setCellMenu({ cellId, options, rect }); return }')
    expect(panel).toContain('<CellOptionsMenu')
    const menu = read('../../player/panels/table-manual/CellOptionsMenu.jsx')
    expect(menu).toContain('onPick(opt)')
    // Портал в body: на десктопе рамка «телефона» с transform делает себя
    // точкой отсчёта для fixed, и меню уезжало на её смещение
    expect(menu).toContain('createPortal(')
    expect(menu).toContain('document.body,')
    // тёмное и с узкой полосой прокрутки
    const css = read('../../../styles/player/panels/table-manual.css')
    expect(css).toContain('.cellMenu::-webkit-scrollbar { width: 3px; }')
    expect(css).toContain('scrollbar-width: thin')
  })

  it('особая ячейка помечена в самой сетке — видно, где есть выбор', () => {
    expect(read('../../../shared/ui/TableGrid.jsx')).toContain("cell.options?.length ? 'tableGridCellOptions' : ''")
    expect(read('../../../styles/table-grid.css')).toContain('.tableGridCellOptions::after')
  })
})
