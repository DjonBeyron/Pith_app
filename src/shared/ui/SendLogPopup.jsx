import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/send-log-popup.css'
import { COMMENT_MAX } from '../lib/sendLogFlow.js'

// Попап «Комментарий к логам» перед отправкой в GitHub (владелец 2026-11-15): что произошло, что слышал / не слышал — уходит отдельным файлом pithy-comment-….txt первым в logs/.
// Рисуется в document.body (position: fixed не зависит от поворотов и transform родителей — игра лежит в повёрнутой сцене). События попапа не пускаем выше: React-события порталов
// идут по дереву компонентов, а наверху — шестерёнка игры / итог гонки, где клик по фону снимает паузу или закрывает окно.
const halt = e => e.stopPropagation()
const STOP = { onPointerDown: halt, onPointerUp: halt, onTouchStart: halt, onTouchEnd: halt, onMouseDown: halt }

export default function SendLogPopup({ value, onChange, onSend, onCancel }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return createPortal(
    <div className="sendLogPop" role="dialog" aria-modal="true" aria-label="Комментарий к логам" data-no-unlock="" data-testid="send-log-popup" {...STOP}
      onClick={e => { halt(e); if (e.target === e.currentTarget) onCancel() }} onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="sendLogPopCard">
        <div className="sendLogPopTitle">Комментарий к логам</div>
        <div className="sendLogPopHint">Что произошло, что слышал и чего не слышал — прочитаю вместе с журналом. Можно оставить пустым.</div>
        <textarea ref={ref} className="sendLogPopText" rows={5} maxLength={COMMENT_MAX} value={value} placeholder="Например: после слов Мии пропал звук" data-testid="send-log-comment" onChange={e => onChange(e.target.value)} />
        <div className="sendLogPopRow">
          <button type="button" className="sendLogPopBtn" onClick={onCancel}>Отмена</button>
          <button type="button" className="sendLogPopBtn sendLogPopGo" onClick={onSend} data-testid="send-log-go">Отправить</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
