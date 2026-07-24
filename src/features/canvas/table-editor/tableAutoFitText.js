import { ROW_UNIT_PX } from '../../../shared/ui/TableGrid.jsx'

// Авто-подгонка размера текста под ячейку — считаем размер, при котором текст
// помещается в ячейку на ширине экрана iPhone SE (375px, самый маленький из
// поддерживаемых) с отступом от края (тот же padding, что и в самой игре —
// см. .tableGridCell в table-grid.css). Результат пишется в cell.fontSize и
// используется TableGrid и в конструкторе, и в плеере.

// 375px экран минус padding .tablePreviewCard (10px с каждой стороны) —
// см. table-editor-preview.css. Держим числом здесь же, чтобы подгонка
// считала по тем же пикселям, что показывает превью.
const SE_TABLE_WIDTH_PX = 355
// Границы размера — общие с ручным изменением (TableGridBuilder.jsx), чтобы
// авто-подгонка и ручные +/- ходили по одному и тому же диапазону.
export const FONT_MAX = 15
export const FONT_MIN = 9
const CELL_PAD_X = 6   // .tableGridCell { padding: 8px 6px } — table-grid.css
const CELL_PAD_Y = 8
const FONT_FAMILY = "'Montserrat', 'Comfortaa', sans-serif"

// Пробный элемент вне экрана: реальный браузерный перенос строк надёжнее,
// чем считать ширину текста вручную по символам.
function fitFontSize(text, boxW, boxH) {
  if (boxW <= 0 || boxH <= 0) return FONT_MIN
  const probe = document.createElement('div')
  Object.assign(probe.style, {
    position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0',
    width: `${boxW}px`, height: `${boxH}px`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', wordBreak: 'break-word', lineHeight: '1.3',
    fontFamily: FONT_FAMILY, overflow: 'hidden',
  })
  probe.textContent = text || ''
  document.body.appendChild(probe)
  let size = FONT_MAX
  for (; size >= FONT_MIN; size--) {
    probe.style.fontSize = `${size}px`
    if (probe.scrollHeight <= boxH + 0.5 && probe.scrollWidth <= boxW + 0.5) break
  }
  document.body.removeChild(probe)
  return Math.max(FONT_MIN, size)
}

// Возвращает table с проставленным cell.fontSize у каждой ячейки.
export function autoFitTableText(table) {
  const totalH = table.rowCount * ROW_UNIT_PX
  const cells = table.cells.map(cell => {
    const wPct = table.columns.slice(cell.col, cell.col + cell.colspan).reduce((s, c) => s + c.widthPct, 0)
    const hPct = table.rows.slice(cell.row, cell.row + cell.rowspan).reduce((s, r) => s + r.heightPct, 0)
    const cellW = SE_TABLE_WIDTH_PX * wPct / 100
    const cellH = totalH * hPct / 100
    const fontSize = fitFontSize(cell.value, cellW - CELL_PAD_X * 2, cellH - CELL_PAD_Y * 2)
    return { ...cell, fontSize }
  })
  return { ...table, cells }
}
