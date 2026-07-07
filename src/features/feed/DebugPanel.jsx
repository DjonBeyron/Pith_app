import { useState } from 'react'
import { collectEnv, fdbgLog } from '../../shared/lib/feedDebug.js'

// Панель дебага ленты: собирает отчёт (окружение + метрики ленты + лог
// событий), умеет Поделиться (share sheet на iPhone), Скопировать, Скачать.
export default function DebugPanel({ getFeedInfo, onClose }) {
  const [report, setReport] = useState(build)
  const [msg, setMsg] = useState('')

  function build() {
    return `${collectEnv()}\n\n--- лента ---\n${getFeedInfo()}\n\n--- лог ---\n${fdbgLog()}`
  }

  function share() {
    if (navigator.share) {
      navigator.share({ title: 'Pithy debug', text: report }).catch(() => {})
    } else {
      setMsg('share недоступен — копируй')
    }
  }

  function copy() {
    navigator.clipboard?.writeText(report)
      .then(() => setMsg('Скопировано'))
      .catch(() => setMsg('Не удалось скопировать'))
  }

  function download() {
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'pithy-debug.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fdbgOverlay">
      <div className="fdbgCard">
        <div className="fdbgHead">
          <b>Дебаг ленты</b>
          <button className="fdbgClose" onClick={onClose}>✕</button>
        </div>
        <textarea className="fdbgText" readOnly value={report} />
        <div className="fdbgBtns">
          <button onClick={share}>Поделиться</button>
          <button onClick={copy}>Скопировать</button>
          <button onClick={download}>Скачать</button>
          <button onClick={() => { setReport(build()); setMsg('Обновлено') }}>Обновить</button>
        </div>
        {msg && <div className="fdbgMsg">{msg}</div>}
      </div>
    </div>
  )
}
