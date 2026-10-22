import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import NoteDialog from './NoteDialog.jsx'
import { buildNotesJson } from './reviewNotes.js'
import { useDragWindow } from './useDragWindow.js'

// Окно со всеми замечаниями: список по порядку ленты, удалить/очистить, добавить общее, скопировать или скачать JSON для Claude
export default function NotesWindow({ store, items, nodes, lessonTitle, onFocus, onClose }) {
  const { notes, general, removeNote, removeGeneral, addGeneral, forget, clear } = store
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const { boxRef, style: winStyle, onHeadMouseDown, reset: resetWin } = useDragWindow('pithy-review-win:notes')
  const json = useMemo(() => buildNotesJson({ notes, general, items, nodes, lessonTitle, originals: store.originalTexts() }), [notes, general, items, nodes, lessonTitle, store])
  const total = json.notes.length + general.length
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 3000) }
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(json, null, 2)); flash('JSON скопирован') } catch { flash('Не удалось скопировать — скачай файлом') }
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }))
    a.download = 'review-notes.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const wipe = () => { if (window.confirm('Удалить все замечания?')) clear() }
  return createPortal(
    <div className="rvwNtBack" onMouseDown={e => e.stopPropagation()}>
      <div ref={boxRef} style={winStyle} className="rvwNtBox rvwNtWide" onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead" title="Тащи за шапку; двойной клик — в центр" onMouseDown={onHeadMouseDown} onDoubleClick={resetWin}><b>Замечания ({total})</b><button className="rvwBtn" onClick={onClose}>Закрыть</button></div>
        <div className="rvwNtList rvwNtScroll">
          {json.notes.length === 0 && general.length === 0 && <div className="rvwEmpty">Пока пусто. Выдели сообщение в ленте и нажми ✎ в его углу</div>}
          {json.notes.map(n => (
            <div key={n.ref} className="rvwNtItem">
              <div className="rvwNtLink" onClick={() => onFocus(n.ref)} title="Показать в ленте">№{n.seq} · {n.type} · {n.ref}{n.branch === 'ветка ошибки' ? ' · ветка ошибки' : ''}</div>
              {n.changed ? (
                <>
                  {n.type_before && <div className="rvwNtQuote"><b>Вид:</b> {n.type_before} → {n.type}</div>}
                  <div className="rvwNtQuote"><b>До:</b> {n.before.slice(0, 200)}</div>
                  <div className="rvwNtQuote"><b>После:</b> {n.after.slice(0, 200)}</div>
                </>
              ) : <div className="rvwNtQuote">{n.before.slice(0, 140)}</div>}
              {notes.filter(x => x.ref === n.ref).map(x => (
                <div key={x.id} className="rvwNtRow"><span>{x.template && <i>{x.template}{x.text ? ': ' : ''}</i>}{x.text}</span><button className="rvwBtn" onClick={() => removeNote(x.id)}>Удалить</button></div>
              ))}
              {n.changed && !n.comments.length && <div className="rvwInfo">только правка текста, без комментария</div>}
              {n.changed && <button className="rvwBtn" title="Убрать эту правку из списка (текст в ноде останется как есть)" onClick={() => forget(n.ref)}>Убрать правку из списка</button>}
            </div>
          ))}
          {general.map(g => (
            <div key={g.id} className="rvwNtItem">
              <div className="rvwNtLink">Общее замечание</div>
              <div>{g.template && <i>{g.template}{g.text ? ': ' : ''}</i>}{g.text}</div>
              <button className="rvwBtn" onClick={() => removeGeneral(g.id)}>Удалить</button>
            </div>
          ))}
        </div>
        <div className="rvwNtBtns">
          <button className="rvwBtn" onClick={() => setAdding(true)}>+ Общее замечание</button>
          <button className="rvwBtn" disabled={!total} onClick={wipe}>Очистить все</button>
          <span className="rvwSpacer" />
          {msg && <span className="rvwInfo rvwInfoOk">{msg}</span>}
          <button className="rvwBtn" disabled={!total} onClick={download}>Скачать JSON</button>
          <button className="rvwBtn rvwBtnPrimary" disabled={!total} onClick={copy}>Скопировать JSON</button>
        </div>
      </div>
      {adding && <NoteDialog title="Общее замечание к уроку" onSave={(t, x) => { addGeneral(t, x); setAdding(false) }} onClose={() => setAdding(false)} />}
    </div>,
    document.body,
  )
}
