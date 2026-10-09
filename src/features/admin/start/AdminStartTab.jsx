import { useState } from 'react'
import { readStartLogs, clearStartLogs } from './startLogStorage.js'
import { formatStartLog, formatStartLogs } from './formatStartLog.js'
import { formatStartShort } from './formatStartShort.js'
import { copyText } from './copyText.js'
import StartLogRow from './StartLogRow.jsx'
import '../../../styles/admin-start.css'

// Админ → «Старт»: журнал запуска приложения на этом устройстве (его пишет inline-скрипт в начале index.html).
// Нужен, чтобы увидеть «моргание» при старте на iPhone там, где мы его не видим: время каждого события, кадры, сдвиги, подозрения.
// Ничего не уходит на сервер — текст копируется в буфер и присылается вручную.
export default function AdminStartTab() {
  const [list, setList] = useState(readStartLogs)
  const [open, setOpen] = useState(null)
  const [note, setNote] = useState('')
  const rows = [...list].reverse() // новые сверху

  async function copyLast() {
    const last = list[list.length - 1]
    if (!last) return
    setNote((await copyText(formatStartLog(last, list[list.length - 2] || null))) ? 'Последний старт скопирован' : 'Не удалось скопировать')
  }
  async function copyShort() {
    const last = list[list.length - 1]
    if (!last) return
    const text = formatStartShort(last, list[list.length - 2] || null)
    setNote((await copyText(text)) ? `Коротко скопировано (${text.length} символов) — вставь в чат` : 'Не удалось скопировать')
  }
  async function copyAll() {
    setNote((await copyText(formatStartLogs(list))) ? `Скопировано стартов: ${list.length}` : 'Не удалось скопировать')
  }
  function clear() {
    if (!window.confirm('Очистить журнал стартов на этом устройстве?')) return
    clearStartLogs()
    setList([]); setOpen(null); setNote('Журнал очищен')
  }

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Старт приложения (журнал {list.length}/8)</span>
        <button className="aeRefresh" onClick={() => { setList(readStartLogs()); setNote('Обновлено') }}>Обновить</button>
      </div>
      <p className="astHowto">Открой приложение с экрана «Домой» 2–3 раза (закрывая его полностью между запусками), затем здесь нажми «Скопировать коротко» (≤ 6000 символов — чат не обрежет) и пришли текст.</p>
      <p className="aeHint">Журнал пишется при каждом запуске, пока сплэш не ушёл (+2 с, не дольше 12 с), и хранится только на этом устройстве (до 8 последних стартов). На сервер ничего не отправляется.</p>
      <div className="astBtns">
        <button className="aeRefresh" onClick={copyShort} disabled={!list.length}>Скопировать коротко</button>
        <button className="aeRefresh" onClick={copyLast} disabled={!list.length}>Скопировать последний старт</button>
        <button className="aeRefresh" onClick={copyAll} disabled={!list.length}>Скопировать все ({list.length})</button>
        <button className="aeRefresh" onClick={clear} disabled={!list.length}>Очистить</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
      {rows.length === 0 && <p className="aeHint">Стартов пока нет — журнал появится после следующего запуска приложения.</p>}
      {rows.map(rec => {
        const i = list.indexOf(rec)
        return (
          <StartLogRow key={rec.id} rec={rec} prev={list[i - 1] || null} open={open === rec.id}
            onToggle={() => setOpen(open === rec.id ? null : rec.id)} onNote={setNote} />
        )
      })}
    </div>
  )
}
