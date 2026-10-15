import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { TASK_LISTS } from './taskModel.js'
import ScTip from './ScTip.jsx'

// Редактор списка строк задания (accept | answers): строки с «удалить» и поле «новый … + Enter». Лимиты — taskModel.TASK_LISTS.
// id блока f-task-<field>, строк f-task-<field>-<i> — подсветка замечаний линтера (lintFieldMap).
export default function TaskStringList({ field, label, tip, items, actions, note = null, placeholder = 'новый вариант, Enter — добавить', itemLabel = 'Вариант' }) {
  const [draft, setDraft] = useState('')
  const rule = TASK_LISTS[field]
  const full = items.length >= rule.max
  const add = () => { actions.addTaskItem(field, draft); setDraft('') }
  return (
    <div className="scbField" id={`f-task-${field}`}>
      <span className="scbFieldLabel">{label} {tip && <ScTip help={tip} />} <span className="scbCounter">{items.length} / {rule.max}</span></span>
      {note && <p className="scbSub">{note}</p>}
      <ol className="scbAccepts">
        {items.map((a, i) => (
          <li key={i} className="scbAcceptRow" id={`f-task-${field}-${i}`}>
            <input className="fsNote" value={a} maxLength={rule.len} onChange={e => actions.updateTaskItem(field, i, e.target.value)} aria-label={`${itemLabel} ${i + 1}`} />
            <button type="button" className="scbIcon scbIconDanger" onClick={() => actions.removeTaskItem(field, i)} aria-label={`Удалить: ${itemLabel.toLowerCase()} ${i + 1}`}><Trash2 size={14} /></button>
          </li>
        ))}
      </ol>
      <div className="scbAcceptRow">
        <input className="fsNote" value={draft} maxLength={rule.len} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder={placeholder} aria-label={`Новый: ${itemLabel.toLowerCase()}`} disabled={full} />
        <button type="button" className="fsBtn fsBtnSmall" onClick={add} disabled={!draft.trim() || full}>Добавить</button>
      </div>
    </div>
  )
}
