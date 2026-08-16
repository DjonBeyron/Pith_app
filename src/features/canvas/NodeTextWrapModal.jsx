import { useState } from 'react'
import { createPortal } from 'react-dom'
import ChatBubblePreview from './ChatBubblePreview.jsx'

const PANEL_W = 340

// Окно «Свои переносы»: слева — тот же текст, где Enter ставит перенос,
// справа-снизу — настоящий пузырь из чата. Пока галочка выключена, перенос в
// уроке не соблюдается и пузырь тянется во всю ширину, как обычно; включённая
// галочка отдаёт разбивку строк автору — пузырь становится ровно по самой
// длинной строке, что в окне видно, то и будет в уроке.
export default function NodeTextWrapModal({
  text, highlights = [], hardWrap, anchorRect, onClose, onChange,
  field = 'content',      // какое поле ноды правим: content или text (аудио)
  widthToggle = true,     // ширина пузыря по строкам — только у текстовой ноды
}) {
  const [value, setValue] = useState(text)
  const [on, setOn] = useState(!!hardWrap)

  const top = Math.min(Math.max(8, (anchorRect?.top ?? 80) - 20), window.innerHeight - 460)
  const left = Math.min((anchorRect?.right ?? 40) + 12, window.innerWidth - PANEL_W - 8)

  function push(nextValue, nextOn) {
    onChange({ [field]: nextValue, ...(widthToggle ? { hardWrap: nextOn } : {}) })
  }

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 398 }} onClick={onClose} />
      <div
        className="textWrapModal"
        style={{ position: 'fixed', top, left, width: PANEL_W, zIndex: 399 }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="textWrapHeader">
          <span>Свои переносы</span>
          <button className="textWrapClose" onClick={onClose}>×</button>
        </div>

        {widthToggle && (
          <label className="textWrapToggle">
            <input
              type="checkbox"
              checked={on}
              onChange={e => { setOn(e.target.checked); push(value, e.target.checked) }}
            />
            <span>Пузырь по моим строкам</span>
          </label>
        )}

        <textarea
          className="textWrapInput"
          value={value}
          onChange={e => { setValue(e.target.value); push(e.target.value, on) }}
          placeholder="Текст сообщения. Enter — новая строка."
          rows={5}
          autoFocus
        />

        <div className="textWrapPreviewLabel">Как придёт в чат</div>
        <div className="textWrapStage">
          <ChatBubblePreview text={value} highlights={highlights} hardWrap={on && widthToggle} />
        </div>
      </div>
    </>,
    document.body,
  )
}
