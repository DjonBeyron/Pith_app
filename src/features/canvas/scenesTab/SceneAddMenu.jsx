import { useState } from 'react'
import { Plus } from 'lucide-react'
import NodeSceneLibraryList from '../NodeSceneLibraryList.jsx'
import { templateItems, templateTypeData, libraryTypeData } from './sceneAddModel.js'

// «+ Добавить сцену»: шаблон ("Кружок Пита", "Шаблон: закажи еду", диалоги, пустая) или сцена из библиотеки.
// Нода создаётся в конец урока (после последней ноды) — дальше её можно открыть в сборщике из строки.
export default function SceneAddMenu({ onAdd, disabled }) {
  const [open, setOpen] = useState(false)
  const [lib, setLib] = useState(false)
  const items = open ? templateItems() : []
  const add = td => { if (td) onAdd(td); setOpen(false); setLib(false) }
  return (
    <div className="scTabAdd">
      <button type="button" className="scTabBtn scTabBtn--primary scTabAddBtn" aria-expanded={open} disabled={disabled} onClick={() => { setOpen(v => !v); setLib(false) }}>
        <Plus size={16} aria-hidden="true" /> Добавить сцену
      </button>
      {open && (
        <div className="scTabAddMenu" role="menu" aria-label="Какую сцену добавить">
          <button type="button" role="menuitem" className="scTabAddItem" onClick={() => setLib(true)}>
            <b>Из библиотеки…</b><span>готовая сцена из «Моих сцен»</span>
          </button>
          {items.map(t => (
            <button key={t.id} type="button" role="menuitem" className="scTabAddItem" onClick={() => add(templateTypeData(t.tpl))}>
              <b>{t.title}</b><span>{t.note}</span>
            </button>
          ))}
        </div>
      )}
      {lib && <NodeSceneLibraryList currentId={null} onPick={row => add(libraryTypeData(row))} onClose={() => setLib(false)} />}
    </div>
  )
}
