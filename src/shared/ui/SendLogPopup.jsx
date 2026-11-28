import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/send-log-popup.css'
import { COMMENT_MAX } from '../lib/sendLogFlow.js'

// Попап «Комментарий к логам» перед отправкой в GitHub (владелец 2026-11-15): что произошло, что слышал / не слышал — уходит отдельным файлом pithy-comment-….txt первым в logs/.
// Рисуется в document.body (position: fixed не зависит от поворотов и transform родителей — игра лежит в повёрнутой сцене). События попапа не пускаем выше: React-события порталов
// идут по дереву компонентов, а наверху — шестерёнка игры / итог гонки, где клик по фону снимает паузу или закрывает окно.
const halt = e => e.stopPropagation()
// тап по галочке не уводит фокус с поля: клавиатура остаётся (на iPhone фокус уходит на mousedown, который эмулируется перед click)
const keepFocus = e => { e.stopPropagation(); e.preventDefault() }
const STOP = { onPointerDown: halt, onPointerUp: halt, onTouchStart: halt, onTouchEnd: halt, onMouseDown: halt }

export default function SendLogPopup({ value, onChange, withLogs, onWithLogs, append, onAppend, onSend, onCancel }) {
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (!el) return; try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* курсор останется в начале */ } }, []) // фокус на поле НЕ ставим (владелец 2026-11-28): на смартфоне клавиатура не должна выскакивать сразу при открытии попапа — поле открывается по тапу; курсор — в конец: текст может начинаться с подставленного адреса блока таймлайна
  // Закрытие попапа (Отмена / Отправить / Esc / фон / размонтирование родителем): поле теряет фокус ЯВНО до удаления из DOM. Кнопки не отбирают фокус (keepFocus), и на iPhone диктовка клавиатуры оставалась
  // активной вместе с удалённым полем — iOS держал микрофон и аудиосессию, «Продолжить» получал мёртвый вывод («звук занят», журнал владельца v3.3.394, iPhone 12 mini)
  useLayoutEffect(() => { const el = ref.current; return () => { try { el?.blur() } catch { /* поле уже убрано */ } } }, [])
  return createPortal(
    <div className="sendLogPop" role="dialog" aria-modal="true" aria-label="Комментарий к логам" data-no-unlock="" data-testid="send-log-popup" {...STOP}
      onClick={e => { halt(e); if (e.target === e.currentTarget) onCancel() }} onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div className="sendLogPopCard">
        <div className="sendLogPopTitle">Комментарий к логам</div>
        <div className="sendLogPopHint">Что произошло, что слышал и чего не слышал — прочитаю вместе с журналом. Можно оставить пустым.</div>
        <textarea ref={ref} className="sendLogPopText" rows={5} maxLength={COMMENT_MAX} value={value} placeholder="Например: после слов Мии пропал звук" data-testid="send-log-comment" onChange={e => onChange(e.target.value)} />
        <label className="sendLogPopCheck" onMouseDown={keepFocus}><input type="checkbox" tabIndex={-1} checked={withLogs} onChange={e => onWithLogs(e.target.checked)} data-testid="send-log-with-logs" /> Отправить логи (журнал и отладку){!withLogs && <b> — уйдёт только комментарий</b>}</label>
        <label className="sendLogPopCheck" onMouseDown={keepFocus}><input type="checkbox" tabIndex={-1} checked={append} onChange={e => onAppend(e.target.checked)} data-testid="send-log-append" /> Дополнить, а не заменить прежнее в GitHub (копить, потом «читай»)</label>
        <div className="sendLogPopRow">
          <button type="button" className="sendLogPopBtn" onMouseDown={keepFocus} onClick={onCancel}>Отмена</button>
          <button type="button" className="sendLogPopBtn sendLogPopGo" onMouseDown={keepFocus} onClick={onSend} data-testid="send-log-go">Отправить</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
