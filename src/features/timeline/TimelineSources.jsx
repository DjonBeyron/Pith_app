// Строка источников экрана «Таймлайн игры»: выбор прохождения (с подписью источника — «это устройство» / «сервер · iPhone · 12:41 · v3.3.339»), «↻ Обновить с сервера», «☁ Сохранить на сервер»
// (для прохождения этого устройства) и состояние сервера: загрузка, ошибка сети (экран при этом работает на своих данных), пусто. entries — timelineStore.sourceList; srv — useTimelineServer.
const STATUS = {
  loading: () => 'сервер: загружаю сохранённые игры…',
  error: st => `сервер недоступен: ${st.error || 'нет ответа'} — показаны только игры этого устройства`,
  ready: st => (st.runs.length ? `на сервере сохранённых игр: ${st.runs.length}` : 'на сервере сохранённых игр пока нет'),
}

export default function TimelineSources({ entries, cur, onPick, srv, hasServer }) {
  const st = srv.state, busy = st.status === 'loading'
  if (!hasServer && entries.length < 2) return null
  return (
    <div className="tlSrc" data-testid="tl-src">
      {entries.length > 1 && <select className="tlSelect" aria-label="Прохождение" value={cur?.key ?? ''} onChange={e => onPick(e.target.value)} data-testid="tl-run-select">{entries.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select>}
      {entries.length === 1 && hasServer && <span className="tlSrcOne">{entries[0].label}</span>}
      {hasServer && <button type="button" className="tlBtn" onClick={srv.reload} disabled={busy} data-testid="tl-reload">↻ Обновить с сервера</button>}
      {hasServer && cur?.src === 'local' && <button type="button" className="tlBtn" onClick={() => srv.save(cur.run)} disabled={srv.saved === 'busy'} data-testid="tl-save">{srv.saved === 'busy' ? '☁ Сохраняю…' : '☁ Сохранить на сервер'}</button>}
      {hasServer && STATUS[st.status] && <span className={`tlSrcState${st.status === 'error' ? ' tlRed' : ''}`} data-testid="tl-src-state" data-status={st.status}>{STATUS[st.status](st)}</span>}
      {srv.saved && srv.saved !== 'busy' && <span className={`tlSrcState${srv.saved.startsWith('✗') ? ' tlRed' : ''}`} data-testid="tl-saved">{srv.saved}</span>}
    </div>
  )
}
