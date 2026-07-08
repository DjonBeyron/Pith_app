import { useState, useEffect } from 'react'
import { sendPush } from '../../shared/api/pushApi.js'
import { getPushState, subscribePush } from '../../shared/lib/push.js'

// Админ: вкладка «Уведомления». Этап 1 — ручная отправка (тест на себя или
// всем подписчикам). Этап 2 (задел): здесь появятся сохранённые шаблоны
// с триггерами (энергия восстановилась, новый модуль, «сегодня не занимался»).
export default function AdminNotificationsTab() {
  const [title, setTitle] = useState('Pithy')
  const [body, setBody] = useState('Тестовое уведомление 🎉')
  const [onlyMine, setOnlyMine] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [myPush, setMyPush] = useState('loading')

  useEffect(() => {
    getPushState().then(setMyPush).catch(() => setMyPush('unsupported'))
  }, [])

  async function subscribeSelf() {
    try {
      await subscribePush()
      setMyPush('on')
    } catch (e) {
      setResult('Подписка не удалась: ' + e.message)
    }
  }

  async function send() {
    setBusy(true)
    setResult('')
    try {
      const r = await sendPush({ title, body, onlyMine })
      setResult(`Подписок: ${r.total}, отправлено: ${r.sent}, ошибок: ${r.failed}, удалено протухших: ${r.removed}`)
    } catch (e) {
      setResult('Ошибка: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adminPanel anWrap">
      <h3 className="anTitle">Отправка уведомления</h3>

      {myPush !== 'on' && myPush !== 'loading' && (
        <div className="anHint">
          {myPush === 'unsupported'
            ? 'На этом устройстве пуши не поддерживаются (на iPhone — добавь приложение на экран Домой).'
            : <>Это устройство ещё не подписано — <button className="anLink" onClick={subscribeSelf}>подписаться</button>, чтобы проверить доставку на себе.</>}
        </div>
      )}

      <label className="anField">
        Заголовок
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />
      </label>
      <label className="anField">
        Текст
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={300} />
      </label>
      <label className="anCheck">
        <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
        Только мне (тест) — снимешь галочку, уйдёт ВСЕМ подписчикам
      </label>

      <button className="primaryBtn" onClick={send} disabled={busy || !title.trim() || !body.trim()}>
        {busy ? 'Отправка...' : onlyMine ? 'Отправить себе' : 'Отправить всем'}
      </button>

      {result && <div className="anResult">{result}</div>}

      <p className="anNote">
        Дальше здесь появятся шаблоны с триггерами: «энергия восстановилась»,
        «новый модуль», «сегодня не занимался».
      </p>
    </div>
  )
}
