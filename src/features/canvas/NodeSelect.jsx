import { useState } from 'react'

// Выпадающий список нод («Тогда → нода #N», «✓ Верно →», «как верно/неверно», сигналы, «в ответ на»). Раньше каждый такой <select> держал <option> на
// КАЖДУЮ ноду урока: в уроке на 300 нод это ~135 тысяч <option> на холсте (а в «Разборе» холстов два) — всё тормозило, окна открывались по 2 секунды.
// Теперь, пока список закрыт, в нём одна строка — выбранная нода; полный список появляется на наведении, фокусе и нажатии, то есть ДО того, как
// браузер раскроет меню (событие React обрабатывается синхронно, DOM к раскрытию уже полный). Закрылся (blur) — снова одна строка.
const defaultLabel = n => `#${n.seq} ${n.type}`
const defaultValue = n => n.id

export default function NodeSelect({
  value, onChange, nodes, className, emptyLabel = '—', filter = null, sort = null,
  getValue = defaultValue, getLabel = defaultLabel, getDisabled = null,
}) {
  const [open, setOpen] = useState(false)
  const key = String(value ?? '')
  const list = nodes ?? []
  let shown
  if (open) {
    shown = filter ? list.filter(filter) : list
    if (sort) shown = [...shown].sort(sort)
  } else {
    const cur = key ? list.find(n => String(getValue(n)) === key) : null
    shown = cur ? [cur] : []
  }
  return (
    <select
      className={className}
      value={value ?? ''}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
      onMouseEnter={() => setOpen(true)}
      onMouseDown={() => setOpen(true)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <option value="">{emptyLabel}</option>
      {shown.map(n => <option key={n.id} value={getValue(n)} disabled={getDisabled ? getDisabled(n) : undefined}>{getLabel(n)}</option>)}
    </select>
  )
}
