import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const bubble   = read('./TableChatBubble.jsx')
const slide    = read('../../panels/table-dictator/dictatorSlideDown.js')
const manual   = read('../../panels/table-manual/TableManualPanel.jsx')
const tableCss = read('../../../../styles/player/modules/table.css')
const dictCss  = read('../../../../styles/player/panels/table-dictator.css')
const indexCss = read('../../../../index.css')

// Таблица, уехавшая в переписку, сохраняет состояние разбора: отработавшие
// ячейки приглушены, а у ячейки со списком видно ИМЕННО выбранное значение.
// Замер после правки (три ширины, 375/393/430): «3 из 5» ячеек приглушены,
// цвет rgba(224,224,224,0.4).
describe('таблица в чате хранит состояние разбора', () => {
  it('пузырь принимает приглушённые и выбранные ячейки', () => {
    expect(bubble).toContain('dimmedIds={sent?.dimmed?.length ? new Set(sent.dimmed) : undefined}')
    expect(bubble).toContain('pickedValues={sent?.picked?.length ? new Map(sent.picked) : undefined}')
  })

  it('диктант кладёт приглушённые ячейки в ответ и больше их не гасит', () => {
    expect(slide).toContain('dimmed: [...usedCells]')
    // Раньше набор обнулялся прямо перед снятием клона — «текст возвращал
    // толщину» ровно в момент перехода
    expect(slide).not.toContain('setUsedCells(new Set())')
  })

  it('ручная таблица кладёт выбранные значения', () => {
    expect(manual).toContain('picked: [...assembledCellValues]')
  })
})

describe('заголовок таблицы в чате не доводится переходом', () => {
  it('статичный бокс перебивает переход по специфичности, а не по порядку', () => {
    // .tdAssemblyBox в table-dictator.css задаёт transition border-color/
    // background. Специфичность у одиночного .tdAssemblyBoxStatic РАВНАЯ, а
    // тот файл импортируется позже — правило молча не работало, и бокс в
    // сообщении доводил рамку уже после подмены. Замер после правки:
    // transition-property = none.
    expect(tableCss).toContain('.tdAssemblyBox.tdAssemblyBoxStatic,')
    expect(tableCss).toContain('.tdAssemblyBox.tdAssemblyBoxStatic .tdAssemblyWord {')
    // Условие, из-за которого это и понадобилось: переход правда есть и
    // правда объявлен в файле, который идёт позже
    expect(dictCss).toMatch(/transition: border-color [\d.]+s, background/)
    const iTable = indexCss.indexOf('styles/player/modules/table.css')
    const iDict  = indexCss.indexOf('styles/player/panels/table-dictator.css')
    expect(iTable).toBeGreaterThan(-1)
    expect(iDict).toBeGreaterThan(iTable)
  })
})
