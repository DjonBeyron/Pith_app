import { useState, useEffect, useMemo } from 'react'
import { loadCurricula, updateCurriculumScene } from '../../../../shared/lib/curriculaApi.js'
import ScTip from '../ScTip.jsx'

// Диалог «Привязать сцену к модулю ленты» внутри окна сборщика (не confirm()): список модулей
// (curriculaApi.loadCurricula) с поиском по названию, у модуля с уже привязанной сценой —
// метка; клик по модулю → updateCurriculumScene(moduleId, sceneId) → статус и закрытие.
// Только для опубликованной сцены (меню блокирует пункт иначе). Esc закрывает (data-esc-own).
export default function LinkModuleDialog({ row, onClose, setStatus }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    let alive = true
    loadCurricula()
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) { setRows([]); setError(e?.message || 'Не удалось загрузить модули') } })
    return () => { alive = false }
  }, [])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? []).filter(m => !needle || String(m.title ?? '').toLowerCase().includes(needle))
  }, [rows, q])

  const link = async m => {
    setBusy(m.id); setError('')
    try {
      await updateCurriculumScene(m.id, row.id)
      setStatus({ kind: 'ok', text: `Сцена «${row.title}» привязана к модулю «${m.title}» — в ленте она заменит видео фразы` })
      onClose()
    } catch (e) { setError(e?.message || 'Не удалось привязать'); setBusy(null) }
  }
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }

  return (
    <div className="scbDlgWrap" data-esc-own="1" onKeyDown={onKey} onClick={e => e.stopPropagation()}>
      <div className="scbDlg" role="dialog" aria-modal="true" aria-label="Привязать сцену к модулю ленты">
        <div className="scbHRow">
          <h3 className="scbDlgTitle">Привязать «{row.title}» к модулю ленты <ScTip help="link_module" /></h3>
          <button type="button" className="fsBtn fsBtnSmall" onClick={onClose}>Закрыть</button>
        </div>
        <input className="fsNote" value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск модуля по названию…" aria-label="Поиск модуля" autoFocus />
        {error && <p className="fsMsg fsMsg-error" role="alert">{error}</p>}
        {rows === null && <p className="scbSub">Загрузка модулей…</p>}
        {rows !== null && !shown.length && !error && <p className="scbSub">{q ? 'Ничего не найдено' : 'Модулей пока нет'}</p>}
        <ul className="scbDlgList">
          {shown.map(m => (
            <li key={m.id}>
              <button type="button" className={`scbDlgRow${m.scene_id === row.id ? ' scbDlgRowOn' : ''}`} onClick={() => link(m)} disabled={!!busy}>
                <span className="scbDlgRowTitle">{m.title || 'Без названия'}</span>
                <span className="scbSub">
                  {m.scene_id === row.id ? 'уже привязана' : m.scene_id ? 'другая сцена — заменится' : m.video_url ? 'есть видео — сцена станет главной' : 'без медиа'}
                  {!m.published && ' · не опубликован'}
                </span>
                {busy === m.id && <span className="scbSub">…</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
