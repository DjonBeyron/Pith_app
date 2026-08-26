import { useRef } from 'react'
import { useNoteBoxDrag } from './useNoteBoxDrag.js'

// Комментарий продакшена — жёлтый стикер, привязанный к ноде на холсте.
//
// Это заметка «для своих»: что доснять, чей голос, какой дубль взять. Живёт
// в самой ноде (node.note — текст, node.noteBox — где стоит и какого размера),
// но НИКОГДА не показывается ученику — ни в плеере, ни в чате: плеер поле note
// просто не читает. Видит её только админ и только в канвасе.
//
// Стикер можно таскать за шапку и растягивать за любую из восьми ручек. Пока
// его не двигали, box нет — он стоит справа от ноды на месте по умолчанию.
const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export default function NodeNoteBox({ note, box, scaleRef, onChange, onBoxChange, onFold, onRemove }) {
  const boxRef = useRef(null)
  const startDrag = useNoteBoxDrag({ boxRef, scaleRef, onBoxChange })

  // Заданное положение/размер перебивают место по умолчанию (справа от ноды)
  const style = box
    ? { left: box.x, top: box.y, width: box.w, height: box.h }
    : undefined

  return (
    <div
      ref={boxRef}
      className={`nodeNote${box ? ' nodeNoteMoved' : ''}`}
      style={style}
      // Стикер стоит поверх холста: без этого протяжка за него таскала бы
      // ноду, а клик по тексту начинал бы выделение рамкой
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="nodeNoteHead" onMouseDown={e => startDrag(e, 'move')}>
        <span className="nodeNoteTitle">Комментарий продакшена</span>
        {/* Свернуть и удалить — РАЗНЫЕ кнопки: раньше был только крестик, и им
            же сворачивали, теряя текст заметки */}
        <button
          className="nodeNoteBtn"
          title="Свернуть комментарий (текст сохранится)"
          onMouseDown={e => e.stopPropagation()}
          onClick={onFold}
        >–</button>
        <button
          className="nodeNoteBtn nodeNoteBtnDel"
          title="Удалить комментарий"
          onMouseDown={e => e.stopPropagation()}
          onClick={onRemove}
        >×</button>
      </div>
      <textarea
        className="nodeNoteInput"
        value={note}
        autoFocus
        placeholder="Заметка для своих: что доснять, какой дубль, чей голос…"
        onChange={e => onChange(e.target.value)}
      />
      {DIRS.map(dir => (
        <span
          key={dir}
          className={`nodeNoteGrip nodeNoteGrip-${dir}`}
          onMouseDown={e => startDrag(e, dir)}
        />
      ))}
    </div>
  )
}
