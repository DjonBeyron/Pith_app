import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { usePanels } from './panelContext.js'

// Кнопка «Свернуть все / Развернуть все» для панелей: column = null — всё окно (тулбар),
// иначе — панели одной колонки (шапка колонки). Сворачивает только верхний уровень
// (panelModel.setAllCollapsed). Без провайдера панелей не рендерится.
export default function CollapseAllButton({ column = null, small = true }) {
  const ctx = usePanels()
  if (!ctx || !ctx.hasPanels(column)) return null
  const all = ctx.allCollapsed(column)
  const label = all ? 'Развернуть все' : 'Свернуть все'
  return (
    <button type="button" className={small ? 'fsBtn fsBtnSmall scbAllBtn' : 'fsBtn scbAllBtn'} onClick={() => ctx.setAll(column, !all)} title={column ? `${label} блоки колонки` : `${label} блоки окна`}>
      {all ? <ChevronsUpDown size={13} aria-hidden="true" /> : <ChevronsDownUp size={13} aria-hidden="true" />} {label}
    </button>
  )
}
