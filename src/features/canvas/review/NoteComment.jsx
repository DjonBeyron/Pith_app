import { useState, useEffect, useRef, memo } from 'react'
import { NOTE_TEMPLATES, EDIT_ONLY } from './reviewNotes.js'

// Нижняя часть окна «Замечание»: шаблоны, поле комментария, список уже добавленных.
// Состояние набора живёт ЗДЕСЬ, а не в NoteDialog: раньше каждая буква перерисовывала
// всё окно целиком — оба превью «как в плеере» и редактор ноды (таблица, озвучка),
// и ввод лагал. Теперь на каждый символ перерисовывается только эта часть.
// dirty — автор поправил текст ноды: кнопка «Добавить замечание» горит и без комментария, правка уходит замечанием «Правка без комментария»
// (автор знает, как лучше, и хочет, чтобы такие правки копились для поиска закономерностей — PROJECT.md «Тренировка системы под автора»).
// onGolden — «⭐ В золотой набор»: пара «до → после» (если правил) или «как нельзя» с замечаниями (lessonExamples.exampleFromNote)
function NoteComment({ session, existing, dirty = false, onSave, onRemove, onDone, onGolden = null }) {
  const [template, setTemplate] = useState('')
  const [text, setText] = useState('')
  // Комментарий и шаблон — своя цепочка отмены (фокус в поле комментария)
  const cmtRef = useRef({ text: '', template: '' })
  useEffect(() => { cmtRef.current = { text, template } })
  useEffect(() => { session?.bindComment({ get: () => cmtRef.current, set: (t, tpl) => { setText(t); setTemplate(tpl) } }) }, [session])
  const typeComment = v => { session?.recordComment(); setText(v) }
  const pickTemplate = t => { session?.recordComment(); setTemplate(t) }
  const save = () => { onSave(template || (text.trim() ? '' : EDIT_ONLY), text.trim()); onDone() } // замечание добавлено — окно закрывается, правки остаются
  const [gold, setGold] = useState('')
  const golden = async () => { if (template || text.trim()) onSave(template, text.trim()); try { await onGolden(); setGold('добавлено ⭐'); setTimeout(() => setGold(''), 2500) } catch (e) { setGold(`не удалось: ${e?.message ?? e}`) } }
  return (
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
        <button className="rvwBtn rvwBtnPrimary" disabled={!template && !text.trim() && !dirty} title={dirty && !template && !text.trim() ? 'Правка текста уйдёт в замечания как «Правка без комментария»' : undefined} onClick={save}>Добавить замечание</button>
        {onGolden && <button className="rvwBtn" title="Сохранить это сообщение в золотой набор: правил — как пара «до → после», не правил — как пример «нельзя» с замечанием" onClick={golden}>⭐ В золотой набор</button>}
        {gold && <span className="rvwInfo">{gold}</span>}
      </div>
    </div>
  )
}

export default memo(NoteComment)
