import { useState } from 'react'
import { createPortal } from 'react-dom'
import { NOTE_TEMPLATES } from './reviewNotes.js'
import NodeEditor from './NodeEditor.jsx'
import { SlotBody } from './PlayerLikeFeed.jsx'

// Одно и то же сообщение: превью «как в плеере» + поля. ro — только чтение
function Side({ label, hint, item, canvasNode, canvasNodes, files, ro, onPatch }) {
  return (
    <div className="rvwNtSide">
      <div className="rvwNtLabel">{label}<span>{hint}</span></div>
      <div className="rvwNtPreview"><div className="rvwPhone"><div className="lessonPlayer rvwLessonPlayer"><div className="playerFeed rvwPlayerFeed"><div className="playerFeedInner">
        <SlotBody item={item} canvasNode={canvasNode} canvasNodes={canvasNodes} files={files} />
      </div></div></div></div></div>
      <NodeEditor key={item.ref + label} node={item.node} onPatch={onPatch} ro={ro} />
    </div>
  )
}

// Окно «Замечание». Слева «До» — оригинал, как был при первом открытии (не меняется), справа «После» — то же сообщение, которое можно править
// (текст, таблица, озвучка, промпт; правки идут в копию урока разбора). Снизу шаблон и комментарий; в JSON уходит и «до», и «после».
// Без item — общее замечание ко всему уроку (только нижняя часть)
export default function NoteDialog({ title, before, item, canvasNode, canvasNodes, files, onPatch, existing = [], onSave, onRemove, onClose }) {
  const [template, setTemplate] = useState('')
  const [text, setText] = useState('')
  const save = () => { onSave(template, text.trim()); setTemplate(''); setText('') }
  const withNode = !!(item && canvasNode && before)
  return createPortal(
    <div className="rvwNtBack" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div className={`rvwNtBox rvwNtSplit${withNode ? '' : ' single'}`} onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead"><b>{title}</b><button className="rvwBtn" onClick={onClose}>Закрыть</button></div>
        {withNode && (
          <div className="rvwNtCols">
            <Side label="До" hint=" · оригинал, не меняется" item={before.item} canvasNode={before.canvasNode} canvasNodes={canvasNodes} files={files} ro />
            <Side label="После" hint=" · можно править" item={item} canvasNode={canvasNode} canvasNodes={canvasNodes} files={files} onPatch={onPatch} />
          </div>
        )}
        <div className="rvwNtHalf">
          <div className="rvwNtLabel">Замечание</div>
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
          <textarea className="rvwNtText" rows={3} autoFocus placeholder="Допиши, как нужно (можно оставить пустым, если хватает шаблона)" value={text} onChange={e => setText(e.target.value)} />
          <div className="rvwNtBtns">
            <button className="rvwBtn rvwBtnPrimary" disabled={!template && !text.trim()} onClick={save}>Добавить замечание</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
