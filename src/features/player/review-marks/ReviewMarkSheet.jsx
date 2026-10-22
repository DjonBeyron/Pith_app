import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MARK_TAGS, buildMark, tagEmoji, tagLabel } from './reviewMarks.js'

// Нижний лист «Пометка» в плеере (админ, долгое нажатие по сообщению): тег + комментарий → reviewMarksApi; уже стоящие пометки
// этой ноды — списком с удалением. Ошибка записи (нет сети, не админ) показывается строкой, лист не закрывается
export default function ReviewMarkSheet({ node, lessonId, existing = [], onAdd, onRemove, onClose }) {
  const [tag, setTag] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    if (!tag || busy) return
    setBusy(true); setError('')
    try { await onAdd(buildMark({ node, lessonId, tag, comment })); onClose() } catch (e) { setError(`Не сохранилось: ${e?.message ?? e}`) } finally { setBusy(false) }
  }
  return createPortal(
    <div className="rmBack" onClick={onClose}>
      <div className="rmSheet" role="dialog" aria-label="Пометка к сообщению" onClick={e => e.stopPropagation()}>
        <div className="rmHead"><b>Пометка · №{node.seq ?? '?'} {node.type}</b><button className="rmClose" onClick={onClose} aria-label="Закрыть">×</button></div>
        {existing.length > 0 && (
          <div className="rmList">
            {existing.map(m => (
              <div key={m.id} className="rmItem"><span>{tagEmoji(m.tag)} {tagLabel(m.tag)}{m.comment ? ` — ${m.comment}` : ''}</span><button className="rmDel" onClick={() => onRemove(m.id).catch(e => setError(String(e?.message ?? e)))}>удалить</button></div>
            ))}
          </div>
        )}
        <div className="rmTags">
          {MARK_TAGS.map(t => <button key={t.id} className={`rmTag${tag === t.id ? ' on' : ''}`} onClick={() => setTag(tag === t.id ? null : t.id)}>{t.emoji} {t.label}</button>)}
        </div>
        <textarea className="rmText" rows={2} placeholder="Что именно не так (необязательно)" value={comment} onChange={e => setComment(e.target.value)} />
        {error && <div className="rmError">{error}</div>}
        <div className="rmBtns">
          <button className="rmBtn" onClick={onClose}>Отмена</button>
          <button className="rmBtn rmBtnPrimary" disabled={!tag || busy} onClick={save}>{busy ? '…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
