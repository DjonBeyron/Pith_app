import { useState } from 'react'
import { STATUS_LABEL } from './sceneLabels.js'
import ScTip from './ScTip.jsx'

// Вкладка «Мои сцены»: библиотека из таблицы scenes — список, открыть, создать (текущий
// черновик как новую строку), дублировать, удалить (с подтверждением в строке),
// переименовать, статус черновик/опубликована (публикация — только без ошибок линтера).
// Таблицы нет (миграция не применена) — понятное сообщение; сборщик живёт на локальном бэкапе.
const fmt = iso => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function SceneLibrary({ draft, library, onOpenRow, onSave, setStatus }) {
  const [askDelete, setAskDelete] = useState(null)
  const [renaming, setRenaming] = useState(null) // { id, title }
  const { items, loading, error, missingTable, busy } = library
  const currentId = draft.saved.id
  const hasErrors = draft.errors.length > 0

  const createNew = async () => {
    draft.actions.detach()
    await onSave('draft')
  }
  const toggleStatus = async row => {
    const next = row.status === 'published' ? 'draft' : 'published'
    if (next === 'published' && row.id === currentId && hasErrors) { setStatus({ kind: 'error', text: 'Сначала исправьте ошибки линтера — опубликовать нельзя' }); return }
    const r = await library.setStatus(row.id, next)
    if (r && row.id === currentId) draft.actions.markSaved(r)
  }
  const remove = async id => {
    setAskDelete(null)
    const ok = await library.remove(id)
    if (ok && id === currentId) draft.actions.detach()
  }
  const rename = async () => {
    const title = renaming.title.trim()
    if (title) {
      const r = await library.rename(renaming.id, title)
      if (r && renaming.id === currentId) { draft.actions.setTitle(title); draft.actions.markSaved({ ...r, scene: draft.scene }) }
    }
    setRenaming(null)
  }

  return (
    <div className="scbLib">
      <div className="scbCtlRow">
        <button type="button" className="fsBtn fsBtnPrimary" onClick={createNew} disabled={busy || missingTable}>Сохранить как новую</button>
        <button type="button" className="fsBtn fsBtnSmall" onClick={library.refresh} disabled={loading}>Обновить</button>
        <ScTip help="library_status" />
      </div>
      {missingTable && (
        <p className="scbMissing" role="alert">
          <b>Примените миграцию scenes.</b> Таблицы ещё нет в базе — библиотека недоступна. Черновик при этом сохраняется на этом устройстве
          (резервная копия) и доступен через вкладку «JSON».
        </p>
      )}
      {!missingTable && error && <p className="fsMsg fsMsg-error" role="alert">{error}</p>}
      {loading && <p className="scbSub">Загрузка…</p>}
      {!loading && !missingTable && items.length === 0 && !error && <p className="scbSub">Сцен пока нет — соберите первую и нажмите «Сохранить как новую».</p>}
      <ul className="scbLibList">
        {items.map(row => (
          <li key={row.id} className={`scbLibRow${row.id === currentId ? ' scbLibRowOn' : ''}`}>
            {renaming?.id === row.id ? (
              <form className="scbLibRename" onSubmit={e => { e.preventDefault(); rename() }}>
                <input className="fsNote" value={renaming.title} maxLength={80} autoFocus onChange={e => setRenaming({ ...renaming, title: e.target.value })} aria-label="Новое название" />
                <button type="submit" className="fsBtn fsBtnSmall">Ок</button>
                <button type="button" className="fsBtn fsBtnSmall" onClick={() => setRenaming(null)}>Отмена</button>
              </form>
            ) : (
              <div className="scbLibMain">
                <button type="button" className="scbLibTitle" onClick={() => onOpenRow(row.id)} title="Открыть в сборщике">{row.title}</button>
                <span className={`scbStatus scbStatus-${row.status}`}>{STATUS_LABEL[row.status]}</span>
                <span className="scbSub">{fmt(row.updated_at)}</span>
              </div>
            )}
            <div className="scbLibBtns">
              <button type="button" className="fsBtn fsBtnSmall" onClick={() => toggleStatus(row)} disabled={busy}>{row.status === 'published' ? 'В черновик' : 'Опубликовать'}</button>
              <button type="button" className="fsBtn fsBtnSmall" onClick={() => setRenaming({ id: row.id, title: row.title })} disabled={busy}>Переименовать</button>
              <button type="button" className="fsBtn fsBtnSmall" onClick={() => library.duplicate(row.id)} disabled={busy}>Дублировать</button>
              {askDelete === row.id ? (
                <span className="scbAsk" role="alert">
                  Удалить? <button type="button" className="fsBtn fsBtnSmall scbDanger" onClick={() => remove(row.id)}>Да</button>
                  <button type="button" className="fsBtn fsBtnSmall" onClick={() => setAskDelete(null)}>Нет</button>
                </span>
              ) : (
                <button type="button" className="fsBtn fsBtnSmall scbDanger" onClick={() => setAskDelete(row.id)} disabled={busy}>Удалить</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
