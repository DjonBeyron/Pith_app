import { useState, useEffect } from 'react'
import { supabase } from '../../shared/api/supabase.js'

const LIMIT = 50

// Админ → Ошибки: последние ошибки клиентов из client_errors (пишет
// errorReport.js). Если SQL-блок «Наблюдаемость» ещё не применён — таблицы
// нет, показывается подсказка вместо списка.
export default function AdminErrorsTab() {
  const [rows, setRows] = useState(null) // null — загрузка
  const [err, setErr]   = useState('')
  const [openId, setOpenId] = useState(null) // раскрытый stack

  // Чистый фетч без setState — состояние ставится в .then-коллбэке
  // (react-hooks/set-state-in-effect запрещает setState в теле эффекта)
  function fetchErrors() {
    return supabase
      .from('client_errors')
      .select('id, user_id, message, stack, source, ua, app_version, created_at')
      .order('created_at', { ascending: false })
      .limit(LIMIT)
  }

  function applyResult({ data, error }) {
    if (error) { setErr(error.message); setRows([]); return }
    setRows(data ?? [])
  }

  // Кнопка «Обновить»: сброс в скелетон + перезагрузка
  function load() {
    setErr('')
    setRows(null)
    fetchErrors().then(applyResult)
  }

  useEffect(() => {
    fetchErrors().then(applyResult)
  }, [])

  function fmt(ts) {
    const d = new Date(ts)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Ошибки клиентов (последние {LIMIT})</span>
        <button className="aeRefresh" onClick={load}>Обновить</button>
      </div>
      {err && (
        <p className="aeError">
          Не удалось загрузить: {err}. Если таблицы нет — применить SQL-блок
          «Наблюдаемость» из supabase_schema.sql.
        </p>
      )}
      {rows === null && <p className="aeHint">Загрузка...</p>}
      {rows?.length === 0 && !err && <p className="aeHint">Ошибок нет — красота</p>}
      {rows?.map(r => (
        <div key={r.id} className="aeRow" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
          <div className="aeRowTop">
            <span className="aeTime">{fmt(r.created_at)}</span>
            <span className="aeVer">v{r.app_version ?? '?'}</span>
            <span className="aeSource">{r.source ?? '?'}</span>
            <span className="aeUser">{r.user_id ? r.user_id.slice(0, 8) : 'гость'}</span>
          </div>
          <div className="aeMsg">{r.message}</div>
          {openId === r.id && (
            <>
              <div className="aeUa">{r.ua}</div>
              {r.stack && <pre className="aeStack">{r.stack}</pre>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
