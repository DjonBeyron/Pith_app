import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import IconBtn from './ui/IconBtn.jsx'
import { TASK_LISTS } from './taskModel.js'
import ScTip from './ScTip.jsx'

// Ключевые слова ответа вида «Ответь коту» — чипы с «убрать» и поле «слово + Enter» (≤ TASK_LISTS.keywords.max).
// Ученику достаточно произнести ключевые слова (доля — порог задания), не всю фразу. id f-task-keywords[-i].
export default function TaskKeywords({ items, actions }) {
  const [draft, setDraft] = useState('')
  const rule = TASK_LISTS.keywords
  const full = items.length >= rule.max
  const add = () => { actions.addTaskItem('keywords', draft); setDraft('') }
  return (
    <div className="scbField" id="f-task-keywords">
      <span className="scbFieldLabel">Ключевые слова <ScTip help="task_keywords" /> <span className="scbCounter">{items.length} / {rule.max}</span></span>
      {items.length > 0 && (
        <ul className="scbChips">
          {items.map((k, i) => (
            <li key={i} className="scbChip" id={`f-task-keywords-${i}`}>
              <span>{k || '—'}</span>
              <button type="button" className="scbChipX" onClick={() => actions.removeTaskItem('keywords', i)} aria-label={`Убрать слово «${k}»`}><X size={12} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="scbAcceptRow">
        <input className="fsNote" data-native-undo="1" value={draft} maxLength={rule.len} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="слово, Enter — добавить" aria-label="Новое ключевое слово" disabled={full} />
        <IconBtn Icon={Plus} label="Добавить слово" onClick={add} disabled={!draft.trim() || full} />
      </div>
    </div>
  )
}
