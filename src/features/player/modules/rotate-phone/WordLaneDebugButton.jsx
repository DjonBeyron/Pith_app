import { useState, useEffect } from 'react'
import { buildDebugFile, saveDebugFile } from './wordLaneDebugExport.js'

// «Скачать отладку» в финале игры «Повтори за диктором»: маленькая серая ссылка (видна только при включённой отладке — dbg.enabled) и строка «что я говорил» (необязательно).
// Запись голоса готовится заранее, пока ученик читает перевод (dbg.prepare), а нажатие только склеивает JSON и сразу отдаёт файл: iOS даёт «Поделиться» лишь сразу после касания.
// Журнал — обычный объект в ref игры, состояние React здесь только на сам экран финала (запись готова / что получилось), а не на каждое событие игры.
const HOW = {
  download: 'Файл скачан',
  share: 'Файл отправлен через «Поделиться»',
  tab: 'Файл открыт в новой вкладке — сохрани его оттуда («Поделиться» → «Сохранить в Файлы»)',
  cancelled: 'Отправка отменена',
  failed: 'Не получилось сохранить файл',
}

export default function WordLaneDebugButton({ dbg, save = saveDebugFile }) {
  const [audio, setAudio] = useState(null) // части записи голоса [{ mime, base64, startedAtMs }]; null — ещё готовится
  const [said, setSaid] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!dbg?.enabled) return undefined
    let alive = true
    dbg.prepare().then(a => { if (alive) setAudio(a) })
    return () => { alive = false }
  }, [dbg])
  if (!dbg?.enabled) return null

  async function download() {
    const file = buildDebugFile({ log: dbg, audio: audio ?? [], userSaid: said })
    const how = await save(file)
    setStatus(`${HOW[how] ?? HOW.failed}${how === 'failed' || how === 'cancelled' ? '' : audio?.length ? ' (с записью голоса)' : ' (записи голоса нет)'}`)
  }

  return (
    <div className="wlDebugBox" data-testid="wl-debug-box">
      <input className="wlDebugSaid" type="text" value={said} maxLength={200} onChange={e => setSaid(e.target.value)} placeholder="Что я говорил (необязательно)" aria-label="Что я говорил" data-testid="wl-debug-said" />
      <button type="button" className="wlDebugLink" onClick={download} disabled={audio === null} data-testid="wl-debug-save">{audio === null ? 'Готовлю запись…' : 'Скачать отладку'}</button>
      {status && <div className="wlDebugStatus" role="status" data-testid="wl-debug-status">{status}</div>}
    </div>
  )
}
