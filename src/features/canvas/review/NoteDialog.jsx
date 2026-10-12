import { useState } from 'react'
import { createPortal } from 'react-dom'
import { NOTE_TEMPLATES } from './reviewNotes.js'
import NodeEditor from './NodeEditor.jsx'
import { SlotBody } from './PlayerLikeFeed.jsx'

// Окно «Замечание»: пополам. Сверху «До» — тот же модуль, что в ленте, и его редактор (текст, таблица, озвучка, промпт — правки идут в копию урока
// разбора). Снизу — шаблон замечания и комментарий. Без node (ref === null) — общее замечание ко всему уроку, только нижняя половина
export default function NoteDialog({ title, item, canvasNode, canvasNodes, files, onPatch, existing = [], onSave, onRemove, onClose }) {
  const [template, setTemplate] = useState('')
  const [text, setText] = useState('')
  const save = () => { onSave(template, text.trim()); setTemplate(''); setText('') }
  const withNode = !!(item && canvasNode)
  return createPortal(
    <div className="rvwNtBack" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div className={`rvwNtBox rvwNtSplit${withNode ? '' : ' single'}`} onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead"><b>{title}</b><button className="rvwBtn" onClick={onClose}>Закрыть</button></div>
        {withNode && (
          <div className="rvwNtHalf">
            <div className="rvwNtLabel">До</div>
            <div className="rvwNtTop">
              <div className="rvwNtPreview"><div className="rvwPhone"><div className="lessonPlayer rvwLessonPlayer"><div className="playerFeed rvwPlayerFeed"><div className="playerFeedInner">
                <SlotBody item={item} canvasNode={canvasNode} canvasNodes={canvasNodes} files={files} />
              </div></div></div></div></div>
              <NodeEditor key={item.ref} node={item.node} onPatch={onPatch} />
            </div>
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
