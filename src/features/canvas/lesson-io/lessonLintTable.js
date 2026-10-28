// Ширина колонок таблицы (R-table-width): на самом узком экране ячейки не должны без нужды переноситься на вторую строку
import { suggestWidths, wrappingCells } from './tableWidths.js'

export function checkTableWidth(nodes) {
  const out = []
  for (const n of nodes) {
    const t = n.type === 'table' ? n.data?.table : null
    if (!t?.columns?.length || !t.cells?.length) continue
    const wraps = wrappingCells(t)
    const sug = suggestWidths(t)
    if (!wraps.length || !sug) continue
    const after = wrappingCells({ ...t, columns: t.columns.map((c, i) => ({ ...c, widthPct: sug[i] })) })
    if (after.length >= wraps.length) continue
    out.push(`[R-table-width] ${n.ref} (table): «${wraps.slice(0, 3).map(c => c.value).join('», «')}» не помещаются в одну строку на узком экране (iPhone SE); колонки ${t.columns.map(c => c.widthPct).join('/')} лучше ${sug.join('/')}: переносов ${after.length} вместо ${wraps.length} — сначала всё в одну строку, потом баланс`)
  }
  return out
}
