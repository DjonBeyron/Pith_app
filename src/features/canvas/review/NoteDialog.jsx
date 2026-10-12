import { useState } from 'react'
import { createPortal } from 'react-dom'
import { NOTE_TEMPLATES } from './reviewNotes.js'

// Окно «Замечание»: выбрать шаблон и дописать как нужно. ref === null — общее замечание ко всему уроку
export default function NoteDialog({ title, existing = [], onSave, onRemove, onClose }) {
  const [template, setTemplate] = useState('')
  const [text, setText] = useState('')
  const save = () => { onSave(template, text.trim()); setTemplate(''); setText('') }
  return createPortal(
    <div className="rvwNtBack" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div className="rvwNtBox" onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead"><b>{title}</b><button className="rvwBtn" onClick={onClose}>Закрыть</button></div>
        {existing.length > 0 && (
          <div className="rvwNtList">
            {existing.map(n => (
              <div key={n.id} className="rvwNtItem"><span>{n.template && <i>{n.template}: </i>}{n.text}</span><button className="rvwBtn" onClick={() => onRemove(n.id)}>Удалить</button></div>
            ))}
          </div>
        )}
        <div className="rvwNtChips">
          {NOTE_TEMPLATES.map(t => <button key={t} className={`rvwNtChip${template === t ? ' on' : ''}`} onClick={() => setTemplate(template === t ? '' : t)}>{t}</button>)}
        </div>
        <textarea className="rvwNtText" rows={4} autoFocus placeholder="Допиши, как нужно (можно оставить пустым, если хватает шаблона)" value={text} onChange={e => setText(e.target.value)} />
        <div className="rvwNtBtns">
          <button className="rvwBtn rvwBtnPrimary" disabled={!template && !text.trim()} onClick={save}>Добавить замечание</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
