import { useState, useRef, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { typeTitle, cleanTitle, NO_TITLE, TITLE_MAX, sceneStatusLabel } from '../../../scene/v2/sceneNaming.js'

// Название сцены в шапке сборщика: крупный текст-кнопка (клик → поле), рядом статус «Черновик ·
// не сохранена». Это единственное редактируемое имя сцены (scene.title = колонка scenes.title, 1–80);
// служебный id админу не показывается (меню «Ещё» → «Копировать id сцены»). Enter / уход фокуса —
// принять (пробелы по краям уходят), Esc — вернуть прежнее и закрыть поле; пока поле открыто, Esc
// окна его не закрывает (data-esc-own). id="f-title" — на кнопке и на поле: к нему ведёт замечание
// линтера «title — введите название». onChange(value) — правка в черновик (actions.setTitle).
export default function SceneTitleField({ title, saved, dirty, onChange }) {
  const [editing, setEditing] = useState(false)
  const startRef = useRef('')
  const inputRef = useRef(null)
  const empty = !cleanTitle(title)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const open = () => { startRef.current = title; setEditing(true) }
  const commit = () => {
    setEditing(false)
    const clean = cleanTitle(title)
    if (clean !== title) onChange(clean)
  }
  const cancel = () => { onChange(startRef.current); setEditing(false) }
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
  }
  const status = sceneStatusLabel({ saved, dirty })
  const state = !saved?.id ? 'new' : saved.status === 'published' ? 'published' : 'draft'

  return (
    <div className="scbSceneTitle" data-native-undo="1" data-esc-own={editing ? '1' : undefined}>
      {editing ? (
        <input
          id="f-title" ref={inputRef} className="fsNote scbSceneTitleInput" value={title} maxLength={TITLE_MAX} aria-label="Название сцены" aria-invalid={empty}
          placeholder="Например: Кофе-брейк" onChange={e => onChange(typeTitle(e.target.value))} onBlur={commit} onKeyDown={onKey}
        />
      ) : (
        <button id="f-title" type="button" className={`scbSceneTitleBtn${empty ? ' scbSceneTitleEmpty' : ''}`} onClick={open} aria-label={`Название сцены: ${empty ? NO_TITLE : cleanTitle(title)}. Изменить`} title="Изменить название сцены">
          <span className="scbSceneTitleText">{empty ? NO_TITLE : cleanTitle(title)}</span>
          <Pencil size={13} aria-hidden="true" />
        </button>
      )}
      <span className="scbSceneStatus" data-state={state} data-dirty={dirty ? '1' : undefined} role="status" aria-label={`Статус сцены: ${status}`}>{status}</span>
    </div>
  )
}
