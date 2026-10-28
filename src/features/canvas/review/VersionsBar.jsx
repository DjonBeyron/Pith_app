import { Square, SquareCheck, GitCompare, Filter } from 'lucide-react'

// Один переключатель-иконка: квадрат-чекбокс + значок + подпись. Настоящий <input type="checkbox"> (клавиатура, доступность), оформлен как кнопка шапки
function IconCheck({ checked, disabled, onChange, title, icon, children }) {
  return (
    <label className={`rvwIconCheck${checked ? ' on' : ''}${disabled ? ' off' : ''}`} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      {checked ? <SquareCheck size={15} /> : <Square size={15} />}
      {icon}
      {children}
    </label>
  )
}

// «Изменения» — чекбокс: полоски у сообщений: розовая — новые, янтарная — изменённые, которые отличаются от ПРЕДЫДУЩЕЙ версии урока (она лежит локально на этом ПК: загрузка, сохранение,
// импорт, прошлое открытие разбора). «Только изменённые» — второй чекбокс: в ленте подряд лишь отличающиеся сообщения (и ветки вне основной цепочки)
// Сколько в метках новых и изменённых (прокомментированные в прошлой версии считаются изменёнными — так задумано)
function countMarks(marks) {
  let added = 0
  for (const m of marks.values()) if (m === 'new') added++
  return { added, changed: marks.size - added }
}

export default function VersionsBar({ versions, onlyChanged, setOnlyChanged }) {
  const { added, changed } = versions.show ? countMarks(versions.marks) : { added: 0, changed: 0 }
  return (
    <>
      <IconCheck icon={<GitCompare size={14} />} checked={versions.show} disabled={!versions.canCompare} onChange={versions.setShow}
        title={versions.canCompare ? 'Сравнить с предыдущей версией урока: розовая полоска у новых, янтарная у изменённых и прокомментированных сообщений' : 'Предыдущей версии урока ещё нет: она появится, когда урок изменится (загрузка, сохранение, импорт или правка) и разбор откроют снова'}>
        Изменения{versions.show ? ` (${added} новых · ${changed} изменённых)` : ''}
      </IconCheck>
      {versions.show && (
        <IconCheck icon={<Filter size={14} />} checked={onlyChanged} onChange={setOnlyChanged} title="Показать в ленте подряд только изменённые сообщения">
          Только изменённые
        </IconCheck>
      )}
    </>
  )
}
