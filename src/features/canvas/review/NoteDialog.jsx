import { useEffect, useRef, useState, memo } from 'react'
import { Undo2, Redo2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import NoteComment from './NoteComment.jsx'
import NodeEditor from './NodeEditor.jsx'
import { SlotBody } from './PlayerLikeFeed.jsx'
import { useDragWindow } from './useDragWindow.js'
import { usePopupWindow } from './usePopupWindow.js'
import { ExternalLink } from 'lucide-react'

// Одно и то же сообщение: превью «как в плеере» + поля. ro — только чтение
const Side = memo(function Side({ label, hint, item, canvasNode, canvasNodes, files, teacherName, ro, onPatch, onType, reg, rev = 0 }) {
  return (
    <div className="rvwNtSide">
      <div className="rvwNtLabel">{label}<span>{hint}</span></div>
      <div className="rvwNtPreview"><div className="rvwPhone"><div className="lessonPlayer rvwLessonPlayer"><div className="playerFeed rvwPlayerFeed"><div className="playerFeedInner">
        <SlotBody item={item} canvasNode={canvasNode} canvasNodes={canvasNodes} files={files} teacherName={teacherName} />
      </div></div></div></div></div>
      <NodeEditor key={`${item.ref}${label}${item.node.type}${rev}`} node={item.node} onPatch={onPatch} onType={onType} reg={reg} ro={ro} />
    </div>
  )
})

// Окно «Замечание». Слева «До» — оригинал, как был при первом открытии (не меняется), справа «После» — то же сообщение, которое можно править
// (текст, таблица, озвучка, промпт; правки идут в копию урока разбора). Снизу шаблон и комментарий; в JSON уходит и «до», и «после».
// Без item — общее замечание ко всему уроку (только нижняя часть)
export default function NoteDialog({ title, before, item, canvasNode, canvasNodes, files, teacherName, onPatch, onType, session, existing = [], onSave, onRemove, onClose, onKeep, onGolden = null }) {
  const withNode = !!(item && canvasNode && before)
  const dirty = withNode && session?.dirty()
  const { boxRef, style: winStyle, onHeadMouseDown, reset: resetWin } = useDragWindow(withNode ? 'pithy-review-win:note' : 'pithy-review-win:general')
  // «⧉ в отдельное окно»: окно замечания уезжает в отдельное окно браузера (хоть на второй монитор); закрыли его крестиком ОС — правки остаются
  const [popped, setPopped] = useState(false)
  const popBody = usePopupWindow(popped, { title, onClosed: () => { setPopped(false); (onKeep ?? onClose)() } })
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
    const doc = popBody?.ownerDocument ?? document
    doc.addEventListener('keydown', h, true)
    return () => doc.removeEventListener('keydown', h, true)
  }, [popBody])
  const box = (
      <div ref={popBody ? null : boxRef} style={popBody ? undefined : winStyle} className={`rvwNtBox rvwNtSplit${withNode ? '' : ' single'}`} onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead" title="Тащи за шапку куда угодно; двойной клик — вернуть в центр" onMouseDown={onHeadMouseDown} onDoubleClick={resetWin}>
          <b>{title}</b>
          <span className="rvwNtHeadBtns">
            {withNode && session && (
              <>
                <button className="rvwBtn rvwNtIconBtn" title="Отменить (Ctrl+Z), до 30 правок" disabled={!session.counts.u} onClick={() => session.undo('n')}><Undo2 size={14} />{session.counts.u > 0 && <span>{session.counts.u}</span>}</button>
                <button className="rvwBtn rvwNtIconBtn" title="Повторить (Ctrl+Shift+Z)" disabled={!session.counts.r} onClick={() => session.redo('n')}><Redo2 size={14} /></button>
              </>
            )}
            {dirty && <button className="rvwBtn" title="Оставить правки в тексте без замечания" onClick={onKeep}>Сохранить правку</button>}
            {!popBody && <button className="rvwBtn rvwNtIconBtn" title="В отдельное окно браузера (можно утащить на второй монитор)" onClick={() => setPopped(true)}><ExternalLink size={14} /></button>}
            <button className="rvwBtn" title={withNode ? 'Закрыть: изменения в редакторе отменяются' : 'Закрыть'} onClick={cancel}>Закрыть</button>
          </span>
        </div>
        {withNode && (
          <div className="rvwNtCols">
            <Side label="До" hint=" · оригинал, не меняется" item={before.item} canvasNode={before.canvasNode} canvasNodes={canvasNodes} files={files} teacherName={teacherName} ro />
            <Side label="После" hint=" · можно править" item={item} canvasNode={canvasNode} canvasNodes={canvasNodes} files={files} teacherName={teacherName} onPatch={onPatch} onType={onType} reg={session?.reg.current} rev={session?.rev} />
          </div>
        )}
        <NoteComment session={session} existing={existing} dirty={!!dirty} onSave={onSave} onRemove={onRemove} onDone={onKeep ?? onClose} onGolden={withNode ? onGolden : null} />
      </div>
  )
  if (popBody) return createPortal(box, popBody)
  return createPortal(<div className="rvwNtBack" onMouseDown={e => e.stopPropagation()}>{box}</div>, document.body)
}
