import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

// Иконка «копировать» с галочкой на секунду; text — строка или функция, возвращающая строку
export default function CopyIcon({ text, title = 'Скопировать', size = 13 }) {
  const [done, setDone] = useState(false)
  const copy = async e => {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(typeof text === 'function' ? text() : text); setDone(true); setTimeout(() => setDone(false), 1200) } catch { /* буфер недоступен */ }
  }
  return <button type="button" className="rvwCopyIcon" title={title} aria-label={title} onClick={copy}>{done ? <Check size={size} /> : <Copy size={size} />}</button>
}
