import { useState } from 'react'
import { authLogText, downloadAuthLog } from '../../shared/lib/authLog.js'

// Строчка «Не входит?» под формой входа: собрать лог входа и отдать его —
// скопировать, скачать файлом или отправить через share sheet (iPhone).
// Видна только разлогиненному (вся карточка входа рисуется только гостю).
//
// Держим мелкой и без рамок: это диагностика на случай «не пускает», она не
// должна конкурировать с кнопкой «Войти».
export default function AuthLogButton() {
  const [msg, setMsg] = useState('')

  function copy() {
    navigator.clipboard?.writeText(authLogText())
      .then(() => setMsg('Лог скопирован — пришли его в поддержку'))
      .catch(() => setMsg('Не вышло скопировать — нажми «Скачать»'))
  }

  function share() {
    navigator.share({ title: 'HETA: лог входа', text: authLogText() })
      .catch(() => { /* человек закрыл share sheet — молча */ })
  }

  return (
    <div className="authLog">
      <span className="authLogLabel">Не входит?</span>
      <button type="button" className="authLogBtn" onClick={copy}>Скопировать лог</button>
      <button type="button" className="authLogBtn" onClick={downloadAuthLog}>Скачать</button>
      {typeof navigator !== 'undefined' && navigator.share && (
        <button type="button" className="authLogBtn" onClick={share}>Поделиться</button>
      )}
      {msg && <div className="authLogMsg">{msg}</div>}
    </div>
  )
}
