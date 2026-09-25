import { dueLabel } from '../learn/learnView.js'

// Строка «Обучение» у слова в Админ → «Колоды»: есть ли слово в СВОЕЙ памяти
// повторения админа и кнопки проверки — «＋ В обучение» (слово к повтору
// сегодня, без прохождения урока), «К повтору сегодня», «Убрать».
// Без карточек слово в повторение не попадёт — кнопка добавления выключена.
// mem — строка word_memory админа или undefined
export default function AdminLearnControls({ word, mem, cards, today, busy, onAdd, onRemove }) {
  if (!mem) {
    return (
      <div className="adkLearn">
        <span className="adkLearnState">Не в обучении</span>
        <button
          className="aeRefresh"
          onClick={() => onAdd(word)}
          disabled={busy || !cards}
          title={cards ? 'В свою память к повтору сегодня — смотри вкладку «Обучение»' : 'Сначала карточки: без колоды слова нет в повторении'}
        >＋ В обучение</button>
      </div>
    )
  }
  const due = mem.due_on <= today
  return (
    <div className="adkLearn">
      <span className="adkLearnState adkLearnState--on">
        В обучении · шаг {mem.step} · {due ? 'к повтору сегодня' : dueLabel(mem.due_on, today)}
      </span>
      {!due && <button className="aeRefresh" onClick={() => onAdd(word)} disabled={busy}>К повтору сегодня</button>}
      <button className="aeRefresh" onClick={() => onRemove(word)} disabled={busy}>Убрать</button>
    </div>
  )
}
