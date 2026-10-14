import { useEffect, useState } from 'react'
import { listScenes, getScene, isMissingTable } from '../../shared/api/scenesApi.js'
import { filterSceneRows } from './scenePickerModel.js'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'

// Список сцен библиотеки (таблица scenes) внутри пикера ноды: поиск по
// названию, клик по строке → загрузка строки целиком (getScene) → onPick(row).
// Админу видны все (черновики тоже — снимок копируется в ноду, статус не важен).
const fmt = iso => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export default function NodeSceneLibraryList({ currentId, onPick, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    let alive = true
    listScenes()
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) { setRows([]); setError(isMissingTable(e) ? 'Таблицы scenes нет — примените миграцию' : (e?.message || 'Не удалось загрузить')) } })
    return () => { alive = false }
  }, [])

  async function pick(id) {
    setBusy(id)
    try {
      const row = await getScene(id)
      if (row?.scene) onPick(row)
      else setError('Сцена не найдена')
    } catch (e) { setError(e?.message || 'Не удалось открыть') }
    setBusy(null)
  }

  const shown = filterSceneRows(rows, q)
  return (
    <div className="nodeSceneLib" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className="nodeSceneLibHead">
        <input
          className="nodeTextInput nodeSceneLibSearch" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Поиск по названию…" autoFocus {...NO_AUTOCORRECT}
        />
        <button type="button" className="nodeSceneBtn" onClick={onClose}>Закрыть</button>
      </div>
      {error && <p className="nodeSceneErr" role="alert">{error}</p>}
      {rows === null && <p className="nodeSceneHint">Загрузка…</p>}
      {rows !== null && !shown.length && !error && <p className="nodeSceneHint">{q ? 'Ничего не найдено' : 'В библиотеке пока нет сцен — соберите первую'}</p>}
      <ul className="nodeSceneLibList">
        {shown.map(r => (
          <li key={r.id}>
            <button
              type="button" className={`nodeSceneLibRow${r.id === currentId ? ' nodeSceneLibRowOn' : ''}`}
              onClick={() => pick(r.id)} disabled={!!busy}
            >
              <span className="nodeSceneLibTitle">{r.title}</span>
              <span className={`nodeSceneLibStatus nodeSceneLibStatus-${r.status}`}>{r.status === 'published' ? 'опубл.' : 'черновик'}</span>
              <span className="nodeSceneLibDate">{fmt(r.updated_at)}</span>
              {busy === r.id && <span className="nodeSceneLibDate">…</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
