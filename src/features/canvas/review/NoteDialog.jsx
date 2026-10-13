import { useState, useEffect, useRef } from 'react'
import { Undo2, Redo2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { NOTE_TEMPLATES } from './reviewNotes.js'
import NodeEditor from './NodeEditor.jsx'
import { SlotBody } from './PlayerLikeFeed.jsx'

// Одно и то же сообщение: превью «как в плеере» + поля. ro — только чтение
function Side({ label, hint, item, canvasNode, canvasNodes, files, teacherName, ro, onPatch, onType, reg, rev = 0 }) {
  return (
    <div className="rvwNtSide">
      <div className="rvwNtLabel">{label}<span>{hint}</span></div>
      <div className="rvwNtPreview"><div className="rvwPhone"><div className="lessonPlayer rvwLessonPlayer"><div className="playerFeed rvwPlayerFeed"><div className="playerFeedInner">
        <SlotBody item={item} canvasNode={canvasNode} canvasNodes={canvasNodes} files={files} teacherName={teacherName} />
      </div></div></div></div></div>
      <NodeEditor key={`${item.ref}${label}${item.node.type}${rev}`} node={item.node} onPatch={onPatch} onType={onType} reg={reg} ro={ro} />
    </div>
  )
}

// Окно «Замечание». Слева «До» — оригинал, как был при первом открытии (не меняется), справа «После» — то же сообщение, которое можно править
// (текст, таблица, озвучка, промпт; правки идут в копию урока разбора). Снизу шаблон и комментарий; в JSON уходит и «до», и «после».
// Без item — общее замечание ко всему уроку (только нижняя часть)
export default function NoteDialog({ title, before, item, canvasNode, canvasNodes, files, teacherName, onPatch, onType, session, existing = [], onSave, onRemove, onClose, onKeep }) {
  const [template, setTemplate] = useState('')
  const [text, setText] = useState('')
  // Комментарий и шаблон — своя цепочка отмены (фокус в поле комментария)
  const cmtRef = useRef({ text: '', template: '' })
  useEffect(() => { cmtRef.current = { text, template } })
  useEffect(() => { session?.bindComment({ get: () => cmtRef.current, set: (t, tpl) => { setText(t); setTemplate(tpl) } }) }, [session])
  const typeComment = v => { session?.recordComment(); setText(v) }
  const pickTemplate = t => { session?.recordComment(); setTemplate(t) }
  const save = () => { onSave(template, text.trim()); (onKeep ?? onClose)() } // замечание добавлено — окно закрывается, правки остаются
  const withNode = !!(item && canvasNode && before)
  const dirty = withNode && session?.dirty()
  // «Закрыть» отменяет всё, что сделано в редакторе (после подтверждения, если что-то менялось); «Сохранить правку» оставляет правки без замечания
  const cancel = () => { if (!dirty || window.confirm('Закрыть? Всё, что вы изменили в редакторе, будет отменено.')) onClose() }
  // Ctrl/Cmd+Z — отмена, Ctrl+Shift+Z / Ctrl+Y — повтор: в редакторе ноды откатываются правки ноды, в поле комментария — набор комментария (у каждого своя цепочка). Слушаем на документе: после отмены
  // поля редактора перечитываются и фокус из них уходит — клавиши должны продолжать работать
  const keyRef = useRef(null)
  const dataSeen = item?.node?.data
  const typeSeen = item?.node?.type
  useEffect(() => { session?.consumeRestore(dataSeen) }, [dataSeen, typeSeen]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    keyRef.current = e => {
      if (!session || !withNode || !(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      const kind = e.target.closest?.('.rvwNtText') ? 'c' : 'n' // фокус в комментарии — отменяем набор комментария, иначе — правки ноды
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); session.undo(kind) }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); session.redo(kind) }
    }
  })
  useEffect(() => {
    const h = e => keyRef.current?.(e)
    document.addEventListener('keydown', h, true)
    return () => document.removeEventListener('keydown', h, true)
  }, [])
  return createPortal(
    <div className="rvwNtBack" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) cancel() }}>
      <div className={`rvwNtBox rvwNtSplit${withNode ? '' : ' single'}`} onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead">
          <b>{title}</b>
          <span className="rvwNtHeadBtns">
            {withNode && session && (
              <>
                <button className="rvwBtn rvwNtIconBtn" title="Отменить (Ctrl+Z), до 30 правок" disabled={!session.counts.u} onClick={() => session.undo('n')}><Undo2 size={14} />{session.counts.u > 0 && <span>{session.counts.u}</span>}</button>
                <button className="rvwBtn rvwNtIconBtn" title="Повторить (Ctrl+Shift+Z)" disabled={!session.counts.r} onClick={() => session.redo('n')}><Redo2 size={14} /></button>
              </>
            )}
            {dirty && <button className="rvwBtn" title="Оставить правки в тексте без замечания" onClick={onKeep}>Сохранить правку</button>}
            <button className="rvwBtn" title={withNode ? 'Закрыть: изменения в редакторе отменяются' : 'Закрыть'} onClick={cancel}>Закрыть</button>
          </span>
        </div>
        {withNode && (
          <div className="rvwNtCols">
            <Side label="До" hint=" · оригинал, не меняется" item={before.item} canvasNode={before.canvasNode} canvasNodes={canvasNodes} files={files} teacherName={teacherName} ro />
            <Side label="После" hint=" · можно править" item={item} canvasNode={canvasNode} canvasNodes={canvasNodes} files={files} teacherName={teacherName} onPatch={onPatch} onType={onType} reg={session?.reg.current} rev={session?.rev} />
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
            {NOTE_TEMPLATES.map(t => <button key={t} className={`rvwNtChip${template === t ? ' on' : ''}`} onClick={() => pickTemplate(template === t ? '' : t)}>{t}</button>)}
          </div>
          <textarea className="rvwNtText" rows={3} autoFocus placeholder="Допиши, как нужно (можно оставить пустым, если хватает шаблона)" value={text} onChange={e => typeComment(e.target.value)} />
          <div className="rvwNtBtns">
            <button className="rvwBtn rvwBtnPrimary" disabled={!template && !text.trim()} onClick={save}>Добавить замечание</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
