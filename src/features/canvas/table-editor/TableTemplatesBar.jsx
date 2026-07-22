import { useState } from 'react'
import { listTemplates, saveTemplate, renameTemplate, deleteTemplate } from './tableTemplates.js'

// Полоса шаблонов в шапке редактора: сохранить текущую сетку как шаблон,
// применить/переименовать/удалить сохранённые. Хранение — tableTemplates.js.
export default function TableTemplatesBar({ table, onApply }) {
  const [templates, setTemplates] = useState(() => listTemplates())

  function handleSave() {
    const name = window.prompt('Название шаблона:')
    if (!name?.trim()) return
    saveTemplate(name.trim(), table)
    setTemplates(listTemplates())
  }

  function handleRename(id, oldName) {
    const name = window.prompt('Новое название:', oldName)
    if (!name?.trim() || name === oldName) return
    renameTemplate(id, name.trim())
    setTemplates(listTemplates())
  }

  function handleDelete(id, name) {
    if (!window.confirm(`Удалить шаблон «${name}»?`)) return
    deleteTemplate(id)
    setTemplates(listTemplates())
  }

  return (
    <div className="tableTemplatesBar">
      <button className="tableEditorBtnGhost" onClick={handleSave}>Сохранить как шаблон</button>
      {templates.map(t => (
        <div key={t.id} className="tableTemplateChip">
          <button className="tableTemplateApply" onClick={() => onApply(t.table)}>
            {t.name} ({t.table.rowCount}×{t.table.colCount})
          </button>
          <button className="tableTemplateAction" onClick={() => handleRename(t.id, t.name)} title="Переименовать">✎</button>
          <button className="tableTemplateAction" onClick={() => handleDelete(t.id, t.name)} title="Удалить">×</button>
        </div>
      ))}
    </div>
  )
}
