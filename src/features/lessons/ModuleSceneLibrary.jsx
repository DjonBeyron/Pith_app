import { useEffect, useState } from 'react'
import SceneRenderer from '../scene/v2/SceneRenderer.jsx'
import { listScenes, getScene, isMissingTable } from '../../shared/api/scenesApi.js'
import { publishedSceneRows } from './moduleSceneModel.js'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'

// Выбор сцены для модуля ленты из библиотеки: только ОПУБЛИКОВАННЫЕ строки (ученик
// получает только их — RLS), поиск по названию; клик по строке грузит сцену целиком
// (getScene) и показывает статичный кадр → «Привязать» (onPick(row)) или «Отмена».
const fmt = iso => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export default function ModuleSceneLibrary({ currentId, onPick, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)
  const [cand, setCand] = useState(null) // строка-кандидат целиком (со сценой)

  useEffect(() => {
    let alive = true
    listScenes()
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) { setRows([]); setError(isMissingTable(e) ? 'Таблицы scenes нет — примените миграцию 20261014140000_scenes.sql' : (e?.message || 'Не удалось загрузить')) } })
    return () => { alive = false }
  }, [])

  async function preview(id) {
    setBusy(id)
    setError('')
    try {
      const row = await getScene(id)
      if (row?.scene) setCand(row)
      else setError('Сцена не найдена')
    } catch (e) { setError(e?.message || 'Не удалось открыть') }
    setBusy(null)
  }

  const shown = publishedSceneRows(rows, q)
  const total = Array.isArray(rows) ? rows.length : 0
  return (
    <div className="msLib" onClick={e => e.stopPropagation()}>
      <div className="msLibHead">
        <input
          className="msLibSearch" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Поиск по названию…" autoFocus {...NO_AUTOCORRECT}
        />
        <button type="button" className="mvAction msBtnSmall" onClick={onClose}>Закрыть</button>
      </div>
      {error && <p className="msErr" role="alert">{error}</p>}
      {rows === null && <p className="mvHint">Загрузка…</p>}
      {rows !== null && !shown.length && !error && (
        <p className="mvHint">
          {q ? 'Ничего не найдено' : total ? 'Опубликованных сцен нет — опубликуйте сцену в «Сцены»' : 'В библиотеке пока нет сцен — соберите первую'}
        </p>
      )}
      {cand && (
        <div className="msCand">
          <div className="msPreview" aria-hidden="true">
            <SceneRenderer scene={cand.scene} mode="static" showBubbles={false} lite />
          </div>
          <div className="msCandMeta">
            <div className="msCandTitle">{cand.title}</div>
            <div className="mvHint">{(cand.scene?.timeline ?? []).length} реплик · опубликована</div>
            <div className="mvRowBtns">
              <button type="button" className="mvAction msPrimary" onClick={() => onPick(cand)}>Привязать</button>
              <button type="button" className="mvAction" onClick={() => setCand(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
      <ul className="msLibList">
        {shown.map(r => (
          <li key={r.id}>
            <button
              type="button" className={`msLibRow${r.id === currentId ? ' msLibRowOn' : ''}${r.id === cand?.id ? ' msLibRowCand' : ''}`}
              onClick={() => preview(r.id)} disabled={!!busy}
            >
              <span className="msLibTitle">{r.title}</span>
              {r.id === currentId && <span className="msLibTag">привязана</span>}
              <span className="msLibDate">{busy === r.id ? '…' : fmt(r.updated_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
