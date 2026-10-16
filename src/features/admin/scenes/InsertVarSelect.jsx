import { sceneVarNames } from '../../scene/v2/sceneVars.js'
import { insertPlaceholder, placeholderFor } from './varsOps.js'

// «Вставить переменную» у поля реплики: список объявленных переменных, выбор вставляет {name} (text)
// или {name:ru} (translation) в позицию курсора/выделения поля inputRef и возвращает фокус после плейсхолдера.
// Нет переменных — ничего не рисуется. Правка идёт через actions.insertVar (отдельный шаг отмены).
export default function InsertVarSelect({ scene, index, field, inputRef, actions, disabled = false }) {
  const names = sceneVarNames(scene)
  if (!names.length) return null
  const insert = name => {
    if (!name) return
    const el = inputRef.current
    const start = el?.selectionStart ?? null
    const end = el?.selectionEnd ?? null
    const cur = scene.timeline[index]?.[field] ?? ''
    const { caret } = insertPlaceholder(cur, name, field, start, end)
    actions.insertVar(index, field, name, start, end)
    setTimeout(() => { el?.focus?.(); el?.setSelectionRange?.(caret, caret) }, 0)
  }
  return (
    <select
      className="fsNote scbInsertVar" value="" disabled={disabled} onChange={e => insert(e.target.value)}
      id={`f-timeline-${index}-${field}-var`} aria-label={field === 'translation' ? 'Вставить перевод переменной в перевод реплики' : 'Вставить переменную в текст реплики'}
    >
      <option value="">＋ Вставить переменную</option>
      {names.map(n => <option key={n} value={n}>{placeholderFor(n, field)}</option>)}
    </select>
  )
}
