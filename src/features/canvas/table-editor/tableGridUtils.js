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

function removeLastAndRenormalize(list, sizeKey) {
  const removed = list[list.length - 1]?.[sizeKey] ?? 0
  const rest = list.slice(0, -1)
  const factor = rest.length ? 100 / (100 - removed) : 1
  return rest.map(x => ({ ...x, [sizeKey]: x[sizeKey] * factor }))
}

function setProportion(list, idx, newPct, sizeKey) {
  if (list.length < 2) return list
  const clamped = Math.max(5, Math.min(90, newPct))
  if (list[idx][sizeKey] === clamped) return list
  const others = list.filter((_, i) => i !== idx)
  const othersSum = others.reduce((s, x) => s + x[sizeKey], 0) || 1
  const factor = (100 - clamped) / othersSum
  return list.map((x, i) => (i === idx ? { ...x, [sizeKey]: clamped } : { ...x, [sizeKey]: x[sizeKey] * factor }))
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

export function setCellValue(table, cellId, value) {
  return { ...table, cells: table.cells.map(c => (c.id === cellId ? { ...c, value } : c)) }
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

// Удаляет только последнюю строку/колонку — ячейки, целиком лежавшие в ней,
// исчезают; ячейки, свисавшие в неё (span>1), теряют одну клетку размера.
export function removeLastRow(table) {
  if (table.rowCount <= 1) return table
  const lastRow = table.rowCount - 1
  const cells = table.cells
    .filter(c => c.row !== lastRow || c.row + c.rowspan - 1 !== lastRow)
    .map(c => (c.row + c.rowspan - 1 === lastRow ? { ...c, rowspan: c.rowspan - 1 } : c))
  const rows = removeLastAndRenormalize(table.rows, 'heightPct')
  return { ...table, rowCount: table.rowCount - 1, rows, cells }
}

export function removeLastColumn(table) {
  if (table.colCount <= 1) return table
  const lastCol = table.colCount - 1
  const cells = table.cells
    .filter(c => c.col !== lastCol || c.col + c.colspan - 1 !== lastCol)
    .map(c => (c.col + c.colspan - 1 === lastCol ? { ...c, colspan: c.colspan - 1 } : c))
  const columns = removeLastAndRenormalize(table.columns, 'widthPct')
  return { ...table, colCount: table.colCount - 1, columns, cells }
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
