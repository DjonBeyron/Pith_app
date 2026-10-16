import { useState } from 'react'
import { FolderOpen, Globe, EyeOff, Pencil, Copy, Trash2, RefreshCw, Check, X, Save } from 'lucide-react'
import { STATUS_LABEL } from './sceneLabels.js'
import ScTip from './ScTip.jsx'
import IconBtn from './ui/IconBtn.jsx'
import UseSceneMenu from './ui/UseSceneMenu.jsx'
import TemplatesGroup from './ui/TemplatesGroup.jsx'
import LinkModuleDialog from './ui/LinkModuleDialog.jsx'
import { useSceneUse } from './ui/useSceneUse.js'
import { templateNote } from '../../scene/v2/sceneVarsNote.js'

// Вкладка «Мои сцены»: библиотека из таблицы scenes — список, открыть, создать (текущий
// черновик как новую строку), дублировать, удалить (подтверждение в строке + «Отменить» в строке статуса
// 8 секунд — мягкое удаление, history/useSoftRemove), переименовать, статус черновик/опубликована (публикация — только без ошибок линтера).
// «Использовать» у каждой строки (ui/UseSceneMenu: в ноде урока / модуле ленты — прямое
// действие через onApplyScene, в админке — меню: открыть, копия, привязать к модулю ленты
// (LinkModuleDialog), скопировать id/JSON); остальные действия строки — иконочный ряд (IconBtn: открыть,
// опубликовать/в черновик, переименовать, дублировать, удалить; подписи в aria-label/title); группа «Шаблоны» (TemplatesGroup) внизу.
// Таблицы нет (миграция не применена) — понятное сообщение; сборщик живёт на локальном бэкапе.
// Пометка «шаблон · N слов»: список берёт только scene->vars (scene_vars), строка с целой сценой — её vars
const rowNote = row => templateNote({ vars: row.scene_vars ?? row.scene?.vars })
const fmt = iso => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function SceneLibrary({ draft, library, onOpenRow, onSave, setStatus, mode = 'admin', onApplyScene = null }) {
  const [askDelete, setAskDelete] = useState(null)
  const [renaming, setRenaming] = useState(null) // { id, title }
  const { items, loading, error, missingTable, busy } = library
  const currentId = draft.saved.id
  const hasErrors = draft.errors.length > 0
  const use = useSceneUse({ library, onOpenRow, onApply: onApplyScene, setStatus })

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
  // Мягкое удаление: строка прячется сразу, в базе удаляется через 8 с; «Отменить» в строке статуса возвращает.
  // Открытая сцена сразу отвязывается от строки (иначе «Сохранить» писало бы в удаляемую), при отмене привязка возвращается
  const remove = row => {
    setAskDelete(null)
    const prevSaved = draft.saved
    const wasCurrent = row.id === currentId
    const key = `undoDelete:${row.id}`
    if (wasCurrent) draft.actions.detach()
    library.removeSoon(row, () => setStatus(st => (st?.action?.id === key ? null : st)))
    setStatus({
      kind: 'ok', text: `Удалено: «${row.title}»`,
      action: {
        id: key, label: 'Отменить',
        run: () => {
          if (!library.undoRemove()) return
          if (wasCurrent) draft.actions.restoreSaved(prevSaved)
          setStatus({ kind: 'ok', text: `Сцена «${row.title}» возвращена в библиотеку` })
        },
      },
    })
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
        <button type="button" className="fsBtn fsBtnPrimary" onClick={createNew} disabled={busy || missingTable}><Save size={14} aria-hidden="true" /> Сохранить как новую</button>
        <IconBtn Icon={RefreshCw} label="Обновить список сцен" onClick={library.refresh} disabled={loading} />
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
                <input className="fsNote" data-native-undo="1" value={renaming.title} maxLength={80} autoFocus onChange={e => setRenaming({ ...renaming, title: e.target.value })} aria-label="Новое название" />
                <button type="submit" className="scbIcon" aria-label="Сохранить название" title="Сохранить название"><Check size={15} aria-hidden="true" /></button>
                <IconBtn Icon={X} label="Отменить переименование" onClick={() => setRenaming(null)} />
              </form>
            ) : (
              <div className="scbLibMain">
                <button type="button" className="scbLibTitle" onClick={() => onOpenRow(row.id)} title="Открыть в сборщике">{row.title}</button>
                <span className={`scbStatus scbStatus-${row.status}`}>{STATUS_LABEL[row.status]}</span>
                {rowNote(row) && <span className="scbSub">{rowNote(row)}</span>}
                <span className="scbSub">{fmt(row.updated_at)}</span>
              </div>
            )}
            <div className="scbLibBtns">
              <UseSceneMenu row={row} mode={mode} onAction={use.act} disabled={busy} />
              <span className="scbLibIcons" role="group" aria-label={`Действия со сценой «${row.title}»`}>
                <IconBtn Icon={FolderOpen} label="Открыть в сборщике" onClick={() => onOpenRow(row.id)} disabled={busy} />
                <IconBtn
                  Icon={row.status === 'published' ? EyeOff : Globe} label={row.status === 'published' ? 'Снять с публикации (в черновик)' : 'Опубликовать в ленту'}
                  onClick={() => toggleStatus(row)} disabled={busy}
                />
                <IconBtn Icon={Pencil} label="Переименовать" onClick={() => setRenaming({ id: row.id, title: row.title })} disabled={busy} />
                <IconBtn Icon={Copy} label="Дублировать" onClick={() => library.duplicate(row.id)} disabled={busy} />
                {askDelete === row.id ? (
                  <span className="scbAsk" role="alert">
                    Удалить? <button type="button" className="fsBtn fsBtnSmall scbDanger" onClick={() => remove(row)}>Да</button>
                    <button type="button" className="fsBtn fsBtnSmall" onClick={() => setAskDelete(null)}>Нет</button>
                  </span>
                ) : (
                  <IconBtn Icon={Trash2} danger label="Удалить" title="Удалить сцену (8 секунд можно отменить)" onClick={() => setAskDelete(row.id)} disabled={busy} />
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <TemplatesGroup draft={draft} setStatus={setStatus} />
      {use.linkRow && <LinkModuleDialog row={use.linkRow} onClose={use.closeLink} setStatus={setStatus} />}
    </div>
  )
}
