import { useState } from 'react'
import { stamp, WHO } from './timelineFormat.js'

// «🎙 Нужно озвучить (N)» в шапке экрана таймлайна: счётчик и раскрывающийся список реплик текущих настроек, которые звучат в ЭТОЙ игре и которым нужна озвучка (timelineLineEdit.voiceTodo: текст изменён, а звук
// старый; звук без длительности; озвучки нет). Строка списка — переход к первому появлению реплики на ленте (onGo(реплика)): там открывается карточка с правкой и «Озвучить заново».
// todo — список; N = 0 — зелёная надпись «всё озвучено»; open0 — список сразу раскрыт (тесты разметки).
export default function TimelineVoiceTodo({ todo, onGo, open0 = false }) {
  const [open, setOpen] = useState(open0)
  if (!todo) return null
  const red = todo.filter(x => x.mark === 'red').length
  return (
    <div className="tlTodo" data-testid="tl-todo">
      <button type="button" className="tlChip tlTodoBtn" aria-expanded={open} disabled={!todo.length} onClick={() => setOpen(v => !v)} data-red={red ? '1' : undefined} data-testid="tl-todo-btn">{todo.length ? `🎙 Нужно озвучить (${todo.length})` : '🎙 всё озвучено'}</button>
      {open && todo.length > 0 && (
        <ol className="tlTodoList" data-testid="tl-todo-list">
          {todo.map(x => (
            <li key={x.id}>
              <button type="button" className="tlTodoItem" data-mark={x.mark} onClick={() => { setOpen(false); onGo(x.line) }} title="Показать первое появление на ленте" data-testid="tl-todo-item">
                <b>{WHO[x.who] ?? x.who}</b> «{x.now || x.line.text}» <small>{x.label} · {x.id} · в игре {x.n} раз{x.n > 1 && x.n < 5 ? 'а' : ''}, впервые на {stamp(x.line.t)}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
