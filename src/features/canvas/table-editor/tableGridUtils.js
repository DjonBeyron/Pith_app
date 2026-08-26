import { deriveAnswerTokens } from '../../../shared/lib/tableCellMatch.js'
// Чистая математика сетки таблицы (без React) — создание, объединение/разбиение
// ячеек, добавление/удаление строк-колонок, пропорции ширины колонок и
// высоты строк (widthPct/heightPct — сумма всегда 100, чтобы баланс
// сохранялся одинаковым на экранах любого размера).
// table: {
//   rowCount, colCount,
//   columns: [{id,widthPct}], rows: [{id,heightPct}],
//   cells: [{id,row,col,rowspan,colspan,value}],
// }

function uid() { return crypto.randomUUID() }

// Общая пропорциональная математика — используется и для колонок (widthPct),
// и для строк (heightPct), поэтому вынесена один раз.
function scaledAppend(list, sizeKey) {
  const newSize = 100 / (list.length + 1)
  const shrink = (100 - newSize) / 100
  return [...list.map(x => ({ ...x, [sizeKey]: x[sizeKey] * shrink })), { id: uid(), [sizeKey]: newSize }]
}

// Таблицы, сохранённые до появления настраиваемой высоты строк, не имеют
// table.rows — достраиваем его дефолтом при загрузке, чтобы билдер не падал.
export function normalizeTable(table) {
  if (!table) return table
  if (table.rows?.length === table.rowCount) return table
  const rows = Array.from({ length: table.rowCount }, () => ({ id: uid(), heightPct: 100 / table.rowCount }))
  return { ...table, rows }
}

export function createInitialTable(rowCount = 2, colCount = 2) {
  const columns = Array.from({ length: colCount }, () => ({ id: uid(), widthPct: 100 / colCount }))
  const rows    = Array.from({ length: rowCount }, () => ({ id: uid(), heightPct: 100 / rowCount }))
  const cells = []
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      cells.push({ id: uid(), row: r, col: c, rowspan: 1, colspan: 1, value: '' })
    }
  }
  return { rowCount, colCount, columns, rows, cells }
}

// rowCount x colCount матрица: [r][c] = id ячейки, занимающей эту клетку (с учётом спанов)
export function buildOccupancy(cells, rowCount, colCount) {
  const grid = Array.from({ length: rowCount }, () => new Array(colCount).fill(null))
  for (const cell of cells) {
    for (let dr = 0; dr < cell.rowspan; dr++) {
      for (let dc = 0; dc < cell.colspan; dc++) {
        const r = cell.row + dr, c = cell.col + dc
        if (r < rowCount && c < colCount) grid[r][c] = cell.id
      }
    }
  }
  return grid
}

// Выделение [r1..r2]x[c1..c2] можно объединить, только если все накрывающие
// его ячейки целиком лежат внутри диапазона (никто не «торчит» наружу).
export function canMergeSelection(cells, r1, c1, r2, c2) {
  if (r1 === r2 && c1 === c2) return false
  const rowCount = Math.max(...cells.map(c => c.row + c.rowspan))
  const colCount = Math.max(...cells.map(c => c.col + c.colspan))
  const occ = buildOccupancy(cells, rowCount, colCount)
  const ids = new Set()
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ids.add(occ[r][c])
  if (ids.size < 2) return false
  return [...ids].every(id => {
    const cell = cells.find(c => c.id === id)
    return cell && cell.row >= r1 && cell.col >= c1 &&
      cell.row + cell.rowspan - 1 <= r2 && cell.col + cell.colspan - 1 <= c2
  })
}

export function mergeSelection(table, r1, c1, r2, c2) {
  if (!canMergeSelection(table.cells, r1, c1, r2, c2)) return table
  const occ = buildOccupancy(table.cells, table.rowCount, table.colCount)
  const ids = new Set()
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ids.add(occ[r][c])
  const merged = table.cells.filter(c => ids.has(c.id))
  const value = merged.map(c => c.value).filter(Boolean).join(' ')
  const survivor = { id: uid(), row: r1, col: c1, rowspan: r2 - r1 + 1, colspan: c2 - c1 + 1, value }
  const cells = [...table.cells.filter(c => !ids.has(c.id)), survivor]
  return { ...table, cells }
}

export function splitCell(table, cellId) {
  const cell = table.cells.find(c => c.id === cellId)
  if (!cell || (cell.rowspan === 1 && cell.colspan === 1)) return table
  const atoms = []
  for (let dr = 0; dr < cell.rowspan; dr++) {
    for (let dc = 0; dc < cell.colspan; dc++) {
      atoms.push({
        id: uid(), row: cell.row + dr, col: cell.col + dc, rowspan: 1, colspan: 1,
        value: dr === 0 && dc === 0 ? cell.value : '',
      })
    }
  }
  const cells = [...table.cells.filter(c => c.id !== cellId), ...atoms]
  return { ...table, cells }
}

// Обратная операция к объединению для целого выделения: разбиваем ВСЕ
// объединённые ячейки, попавшие в рамку. Раньше разбить можно было только
// одну ячейку за раз — после сборки сложной шапки это было долго.
export function mergedCellsInSelection(cells, r1, c1, r2, c2) {
  return (cells ?? []).filter(c =>
    c.row <= r2 && c.row + c.rowspan - 1 >= r1 &&
    c.col <= c2 && c.col + c.colspan - 1 >= c1 &&
    (c.rowspan > 1 || c.colspan > 1))
}

export function splitSelection(table, r1, c1, r2, c2) {
  return mergedCellsInSelection(table.cells, r1, c1, r2, c2)
    .reduce((t, cell) => splitCell(t, cell.id), table)
}

export function setCellValue(table, cellId, value) {
  return { ...table, cells: table.cells.map(c => (c.id === cellId ? { ...c, value } : c)) }
}

// Ручное изменение размера текста одной ячейки (независимо от авто-подгонки —
// см. tableAutoFitText.js; оба пишут в одно и то же поле cell.fontSize).
// Размер текста сразу для нескольких ячеек: A−/A+ в тулбаре работают и по
// одной ячейке, и по целому выделению. Границы (min/max/def) приходят из
// tableAutoFitText.js — здесь их не знаем, чтобы не заводить лишнюю связь.
export function bumpCellsFontSize(table, ids, delta, { min, max, def }) {
  const set = new Set(ids)
  return {
    ...table,
    cells: table.cells.map(c => set.has(c.id)
      ? { ...c, fontSize: Math.max(min, Math.min(max, (c.fontSize ?? def) + delta)) }
      : c),
  }
}

// Особые значения ячейки: список вариантов, из которых выбирают в уроке.
// Сама ячейка выглядит как прежде («he/she/it»), но по тапу в чате из неё
// выпадает меню, а в авто-режиме нужное значение выбирает автор на таймлайне.
// Пустой список = обычная ячейка, поэтому поле просто убирается.
export function setCellOptions(table, cellId, options) {
  const clean = (options ?? []).map(o => o.trim()).filter(Boolean)
  return {
    ...table,
    cells: table.cells.map(c => {
      if (c.id !== cellId) return c
      if (!clean.length) { const { options: _drop, ...rest } = c; return rest }
      return { ...c, options: clean }
    }),
  }
}

// Варианты ячейки (пустой массив, если это обычная ячейка)
export function cellOptions(cell) {
  return cell?.options?.length ? cell.options : []
}

export function setCellFontSize(table, cellId, fontSize) {
  return { ...table, cells: table.cells.map(c => (c.id === cellId ? { ...c, fontSize } : c)) }
}

// true, только если ВСЕ ячейки в выделении уже заголовки — используется, чтобы
// решить, что делает toggleHeaderSelection дальше (снять со всех / поставить всем).
export function isHeaderSelection(cells, rowCount, colCount, r1, c1, r2, c2) {
  const occ = buildOccupancy(cells, rowCount, colCount)
  const ids = new Set()
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ids.add(occ[r][c])
  return ids.size > 0 && [...ids].every(id => cells.find(c => c.id === id)?.isHeader)
}

export function toggleHeaderSelection(table, r1, c1, r2, c2) {
  const allHeader = isHeaderSelection(table.cells, table.rowCount, table.colCount, r1, c1, r2, c2)
  const occ = buildOccupancy(table.cells, table.rowCount, table.colCount)
  const ids = new Set()
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ids.add(occ[r][c])
  return { ...table, cells: table.cells.map(c => (ids.has(c.id) ? { ...c, isHeader: !allHeader } : c)) }
}

export function addRow(table) {
  const row = table.rowCount
  const newCells = Array.from({ length: table.colCount }, (_, c) => ({
    id: uid(), row, col: c, rowspan: 1, colspan: 1, value: '',
  }))
  const rows = scaledAppend(table.rows, 'heightPct')
  return { ...table, rowCount: table.rowCount + 1, rows, cells: [...table.cells, ...newCells] }
}

export function addColumn(table) {
  const col = table.colCount
  const newCells = Array.from({ length: table.rowCount }, (_, r) => ({
    id: uid(), row: r, col, rowspan: 1, colspan: 1, value: '',
  }))
  const columns = scaledAppend(table.columns, 'widthPct')
  return { ...table, colCount: table.colCount + 1, columns, cells: [...table.cells, ...newCells] }
}

// Пропорции после удаления произвольных полос: остаток растягиваем обратно
// до 100%, сохраняя соотношение между оставшимися
function renormalize(list, sizeKey) {
  const total = list.reduce((sum, x) => sum + (x[sizeKey] ?? 0), 0)
  if (!list.length) return list
  if (!total) return list.map(x => ({ ...x, [sizeKey]: 100 / list.length }))
  return list.map(x => ({ ...x, [sizeKey]: (x[sizeKey] ?? 0) * 100 / total }))
}

// Удаление ЛЮБЫХ строк/колонок (не только последних): ячейки, целиком лежавшие
// внутри удаляемых полос, исчезают; ячейки, задевавшие их объединением
// (span > 1), теряют ровно столько клеток, сколько попало под нож; всё, что
// стояло дальше, съезжает на освободившееся место.
//
// removeRows/removeCols — общая математика для обеих осей: разница только в
// именах полей, поэтому написана один раз и параметризована.
function removeBand(table, from, to, axis) {
  const isRow    = axis === 'row'
  const countKey = isRow ? 'rowCount'  : 'colCount'
  const spanKey  = isRow ? 'rowspan'   : 'colspan'
  const posKey   = isRow ? 'row'       : 'col'
  const listKey  = isRow ? 'rows'      : 'columns'
  const sizeKey  = isRow ? 'heightPct' : 'widthPct'

  const total = table[countKey]
  const a = Math.max(0, Math.min(from, to))
  const b = Math.min(total - 1, Math.max(from, to))
  const n = b - a + 1
  // Пустая таблица никому не нужна — хотя бы одна полоса остаётся
  if (n <= 0 || n >= total) return table

  const cells = []
  for (const c of table.cells) {
    const start = c[posKey]
    const end   = start + c[spanKey] - 1
    const overlap = Math.min(end, b) - Math.max(start, a) + 1
    if (overlap >= c[spanKey]) continue           // ячейка целиком под ножом
    const span = c[spanKey] - Math.max(0, overlap)
    const pos  = start > b ? start - n : (start >= a ? a : start)
    cells.push({ ...c, [posKey]: pos, [spanKey]: span })
  }
  const list = renormalize(table[listKey].filter((_, i) => i < a || i > b), sizeKey)
  return { ...table, [countKey]: total - n, [listKey]: list, cells }
}

export function removeRows(table, from, to = from) { return removeBand(table, from, to, 'row') }
export function removeCols(table, from, to = from) { return removeBand(table, from, to, 'col') }

export function removeLastRow(table) {
  return removeRows(table, table.rowCount - 1)
}

export function removeLastColumn(table) {
  return removeCols(table, table.colCount - 1)
}

// Тянем границу МЕЖДУ дорожкой idx и idx+1 — меняются только эти две,
// остальные не трогаются. Это правильное поведение для ручек ресайза:
// граница объединённой ячейки не должна двигать соседние колонки/строки.
function resizeBetween(list, idx, newPct, sizeKey) {
  if (idx + 1 >= list.length) return list
  const total = list[idx][sizeKey] + list[idx + 1][sizeKey]
  const clamped = Math.max(5, Math.min(total - 5, newPct))
  if (list[idx][sizeKey] === clamped) return list
  return list.map((x, i) => {
    if (i === idx)     return { ...x, [sizeKey]: clamped }
    if (i === idx + 1) return { ...x, [sizeKey]: total - clamped }
    return x
  })
}

export function setColumnWidth(table, idx, newPct) {
  const columns = resizeBetween(table.columns, idx, newPct, 'widthPct')
  return columns === table.columns ? table : { ...table, columns }
}

export function setRowHeight(table, idx, newPct) {
  const rows = resizeBetween(table.rows, idx, newPct, 'heightPct')
  return rows === table.rows ? table : { ...table, rows }
}

// Слова ответа, которых нет в ячейках таблицы (особые значения тоже считаются
// «в таблице» — за связь отвечает общий разбор, tableCellMatch.js): именно для них в таймлайне
// заводятся отдельные дорожки-слова. Та же логика, что у плеера
// (deriveTokens в TableDictatorPanel) — иначе редактор и урок разойдутся:
// каждое слово занимает свою ячейку, повторы не съедают одну и ту же.
export function answerWordsOutsideTable(answer, cells) {
  return deriveAnswerTokens(answer, cells)
    .filter(tok => tok.type === 'extra')
    .map(tok => tok.value)
}

// Порядок дорожек таймлайна:
//   1) ячейки таблицы — ПО СТРОКАМ (вся строка 1 слева направо, потом 2, ...):
//      так же, как таблицу читают глазами и как её обычно надиктовывают,
//   2) слова вне таблицы — в порядке добавления,
//   3) «Проверить» — ВСЕГДА последней, когда бы её ни добавили: проверка идёт
//      после всего собранного, и снизу её место читается само собой.
// Сортировка стабильная (Array.prototype.sort в JS гарантирует это), поэтому
// слова между собой порядок не меняют.
export function sortTimelineLayers(layers, cellById) {
  const rank = l => {
    if (l.isCheck) return 2
    return cellById.get(l.cellId) ? 0 : 1
  }
  return [...(layers ?? [])].sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra !== 0) return 0
    const ca = cellById.get(a.cellId), cb = cellById.get(b.cellId)
    return ca.row !== cb.row ? ca.row - cb.row : ca.col - cb.col
  })
}
