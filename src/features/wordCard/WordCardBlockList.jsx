import { useState } from 'react'
import { BLOCK_TYPES, BLOCK_LABEL, blockSummary } from './wordCardModel.js'
import { TextEditor, TableEditor, FormulaEditor, CasesEditor } from './WordCardBlockEditors.jsx'
import WordCardDialogEditor from './WordCardDialogEditor.jsx'

const EDITOR = { text: TextEditor, table: TableEditor, formula: FormulaEditor, cases: CasesEditor, dialog: WordCardDialogEditor }

// Центр редактора «Справка»: блоки по порядку (каждый сворачивается, двигается ↑↓,
// удаляется ✕) и меню «＋ Добавить блок». «＋ Из урока» не создаёт блок сам — открывает
// урок слева, где у каждого сообщения кнопка «＋ в справку»
export default function WordCardBlockList({
  nodes, canAdd, onAdd, onUpdate, onRemove, onMove, onShowLesson, lessonShown,
}) {
  const [closed, setClosed] = useState(() => new Set())
  const [menu, setMenu] = useState(false)
  const toggle = id => setClosed(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="wcEdList">
      {nodes.length === 0 && (
        <div className="rcEmpty">
          Справки пока нет. Нажми «＋ Добавить блок» — текст, таблица, формула, случаи или пример диалога —
          или забери сообщение из урока слева кнопкой «＋ в справку».
        </div>
      )}
      {nodes.map((b, i) => {
        const Editor = EDITOR[b.type]
        const shut = closed.has(b.id)
        return (
          <section key={b.id} className="wcEdBlock" data-block-type={b.type}>
            <header className="wcEdBlockHead">
              <button className="wcEdFold" onClick={() => toggle(b.id)} aria-expanded={!shut}>
                <span className="wcEdType">{BLOCK_LABEL[b.type]}</span>
                <span className="wcEdSum">{blockSummary(b)}</span>
              </button>
              <button className="wcEdMini" onClick={() => onMove(b.id, -1)} disabled={i === 0} aria-label="Выше">↑</button>
              <button className="wcEdMini" onClick={() => onMove(b.id, 1)} disabled={i === nodes.length - 1} aria-label="Ниже">↓</button>
              <button className="wcEdMini" onClick={() => onRemove(b.id)} aria-label={`Удалить блок «${BLOCK_LABEL[b.type]}»`}>✕</button>
            </header>
            {!shut && <div className="wcEdBody"><Editor b={b} onChange={patch => onUpdate(b.id, patch)} /></div>}
          </section>
        )
      })}

      <div className="wcEdAdd">
        <button className="pageTabBtn" onClick={() => setMenu(v => !v)} disabled={!canAdd} aria-expanded={menu}>
          {canAdd ? '＋ Добавить блок' : 'Максимум блоков'}
        </button>
        {menu && canAdd && (
          <div className="wcEdMenu" role="menu">
            {BLOCK_TYPES.map(t => (
              <button key={t.type} role="menuitem" onClick={() => { onAdd(t.type); setMenu(false) }}>＋ {t.label}</button>
            ))}
            <button role="menuitem" onClick={() => { onShowLesson(); setMenu(false) }}>
              ＋ Из урока{lessonShown ? ' (слева)' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
