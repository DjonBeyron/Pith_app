import { useMemo } from 'react'
import { formatStartLog, startSummary } from './formatStartLog.js'
import { formatStartShort } from './formatStartShort.js'
import { copyText } from './copyText.js'

// Одна строка списка стартов: итог в одну линию, по тапу — полный журнал текстом и кнопка «Скопировать этот старт»
export default function StartLogRow({ rec, prev, open, onToggle, onNote }) {
  const s = useMemo(() => startSummary(rec, prev), [rec, prev])
  const body = useMemo(() => (open ? formatStartLog(rec, prev) : ''), [open, rec, prev])
  const when = new Date(rec.id)
  const label = Number.isNaN(when.getTime()) ? rec.id : when.toLocaleString('ru-RU')

  async function copy() {
    onNote((await copyText(body)) ? 'Старт скопирован' : 'Не удалось скопировать — выделите текст вручную')
  }

  async function copyShort() {
    const text = formatStartShort(rec, prev)
    onNote((await copyText(text)) ? `Коротко скопировано (${text.length} символов)` : 'Не удалось скопировать')
  }

  return (
    <div className={`astRow${open ? ' astRowOpen' : ''}`}>
      <button className="astRowHead" onClick={onToggle} aria-expanded={open}>
        <span className="astWhen">{label}</span>
        <span className="astTags">
          <span className={`astTag ${s.launch === 'холодный' ? 'astTagCold' : 'astTagWarm'}`}>{s.launch}</span>
          <span className="astTag">{s.nav}</span>
          {s.variant && <span className="astTag astTagVar">вариант {s.variant}</span>}
          <span className={`astTag ${s.standalone ? 'astTagOn' : 'astTagOff'}`}>{s.standalone ? 'standalone' : 'не PWA'}</span>
          {s.warns > 0 && <span className="astTag astTagWarn">подозрений: {s.warns}</span>}
        </span>
        <span className="astSum">{s.parts.join(' · ')}</span>
      </button>
      {open && (
        <div className="astDetail">
          <pre className="astPre">{body}</pre>
          <button className="aeRefresh" onClick={copyShort}>Скопировать коротко</button>
          <button className="aeRefresh" onClick={copy}>Скопировать этот старт</button>
        </div>
      )}
    </div>
  )
}
