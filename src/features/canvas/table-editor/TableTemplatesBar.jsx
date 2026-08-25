import { useTableTemplates } from './useTableTemplates.js'

// Полоса шаблонов в шапке редактора: сохранить текущую сетку как шаблон,
// применить/переименовать/удалить сохранённые. Шаблоны лежат на сервере и
// общие для всех уроков — хранение и загрузка в useTableTemplates.js.
export default function TableTemplatesBar({ table, onApply }) {
  const { templates, busy, error, save, rename, remove } = useTableTemplates()

  function handleSave() {
    const name = window.prompt('Название шаблона:')
    if (!name?.trim()) return
    save(name.trim(), table)
  }

  function handleRename(id, oldName) {
    const name = window.prompt('Новое название:', oldName)
    if (!name?.trim() || name === oldName) return
    rename(id, name.trim())
  }

  function handleDelete(id, name) {
    if (!window.confirm(`Удалить шаблон «${name}»? Он пропадёт во всех уроках.`)) return
    remove(id)
  }

  return (
    <div className="tableTemplatesBar">
      <button className="tableEditorBtnGhost" onClick={handleSave} disabled={busy}>
        Сохранить как шаблон
      </button>
      {templates.map(t => (
        <div key={t.id} className="tableTemplateChip">
          <button className="tableTemplateApply" onClick={() => onApply(t.table)}>
            {t.name} ({t.table?.rowCount ?? '?'}×{t.table?.colCount ?? '?'})
          </button>
          <button className="tableTemplateAction" onClick={() => handleRename(t.id, t.name)} title="Переименовать">✎</button>
          <button className="tableTemplateAction" onClick={() => handleDelete(t.id, t.name)} title="Удалить">×</button>
        </div>
      ))}
      {busy && <span className="tableTemplatesNote">…</span>}
      {error && <span className="tableTemplatesNote tableTemplatesNoteErr">{error}</span>}
    </div>
  )
}
