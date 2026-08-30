import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

// Микро-кнопка «скопировать текст» у поля ввода ноды.
//
// Копирует ЧИСТЫЙ текст, без раскраски: highlights живут отдельным массивом и
// в буфер не идут вовсе — в отличие от выделения мышью, которое тащит за собой
// разметку contentEditable и вставляется в чужой редактор вместе с цветами и
// жирностью. Здесь всегда просто строка.
//
// Появляется только при наведении на поле (см. .richTextBox:hover в
// rich-text-field.css): у ноды и так тесно, а нужна она изредка.
export default function CopyPlainButton({ text }) {
  const [done, setDone] = useState(false)
  if (!text) return null

  async function copy(e) {
    // Поле — contentEditable внутри перетаскиваемой ноды: без остановки клик
    // ушёл бы в холст и начал выделение рамкой
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return   // нет разрешения или не защищённый origin — молча ничего
    }
    setDone(true)
    setTimeout(() => setDone(false), 1200)
  }

  return (
    <button
      type="button"
      className="richTextCopy"
      title={done ? 'Скопировано' : 'Скопировать текст без раскраски'}
      aria-label="Скопировать текст без раскраски"
      onMouseDown={e => e.stopPropagation()}
      onClick={copy}
    >
      {done ? <Check size={11} /> : <Copy size={11} />}
    </button>
  )
}
