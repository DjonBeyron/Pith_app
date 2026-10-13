import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import NoteDialog from './NoteDialog.jsx'
import { buildNotesJson } from './reviewNotes.js'
import { nodeCopyText } from './nodeCopyText.js'

// Окно со всеми замечаниями: список по порядку ленты, удалить/очистить, добавить общее, скопировать или скачать JSON для Claude
export default function NotesWindow({ store, items, nodes, lessonTitle, onFocus, onClose }) {
  const { notes, general, removeNote, removeGeneral, addGeneral, clear } = store
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const json = useMemo(() => buildNotesJson({ notes, general, items, nodes, lessonTitle, originals: store.originalTexts() }), [notes, general, items, nodes, lessonTitle, store])
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const rank = ref => { const k = json.notes.findIndex(x => x.ref === ref); return k < 0 ? 1e9 : k }
  const ordered = [...notes].sort((a, b) => rank(a.ref) - rank(b.ref))
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
    <div className="rvwNtBack" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div className="rvwNtBox rvwNtWide" onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead"><b>Замечания ({notes.length + general.length})</b><button className="rvwBtn" onClick={onClose}>Закрыть</button></div>
        <div className="rvwNtList rvwNtScroll">
          {json.notes.length === 0 && general.length === 0 && <div className="rvwEmpty">Пока пусто. Выдели сообщение в ленте и нажми ✎ в его углу</div>}
          {ordered.map(n => (
            <div key={n.id} className="rvwNtItem">
              <div className="rvwNtLink" onClick={() => onFocus(n.ref)} title="Показать в ленте">№{byRef.get(n.ref)?.seq} · {byRef.get(n.ref)?.type} · {n.ref}</div>
              <div className="rvwNtQuote">{nodeCopyText(byRef.get(n.ref) ?? {}).slice(0, 140)}</div>
              <div>{n.template && <i>{n.template}{n.text ? ': ' : ''}</i>}{n.text}</div>
              <button className="rvwBtn" onClick={() => removeNote(n.id)}>Удалить</button>
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
          <button className="rvwBtn" disabled={!notes.length && !general.length} onClick={wipe}>Очистить все</button>
          <span className="rvwSpacer" />
          {msg && <span className="rvwInfo rvwInfoOk">{msg}</span>}
          <button className="rvwBtn" disabled={!notes.length && !general.length} onClick={download}>Скачать JSON</button>
          <button className="rvwBtn rvwBtnPrimary" disabled={!notes.length && !general.length} onClick={copy}>Скопировать JSON</button>
        </div>
      </div>
      {adding && <NoteDialog title="Общее замечание к уроку" onSave={(t, x) => { addGeneral(t, x); setAdding(false) }} onClose={() => setAdding(false)} />}
    </div>,
    document.body,
  )
}
