import { createPortal } from 'react-dom'
import { useReviewSession } from './useReviewSession.js'
import { currentItem } from './reviewSession.js'
import { introLine } from './reviewTeacher.js'
import ReviewTurn from './ReviewTurn.jsx'
import ReviewSummary from './ReviewSummary.jsx'

// Экран повторения дня (этап 4 системы повторения, PROJECT.md → «Формат
// повторения»): строка учителя → карточки вперемешку → итог. Полноэкранный
// слой в body (портал): открывается из любого места, не завися от
// transform/overflow родителя. Пока вход один — админка → «Повторение».
function Message({ title, text, onClose }) {
  return (
    <div className="reviewCenter">
      {title && <h2 className="reviewSummaryTitle">{title}</h2>}
      <p className="reviewTeacherLine">{text}</p>
      <button className="reviewBtn reviewBtn--main" onClick={onClose}>Закрыть</button>
    </div>
  )
}

export default function ReviewScreen({ onClose }) {
  const r = useReviewSession()
  const item = r.session && currentItem(r.session)

  let body = null
  if (r.phase === 'loading') body = <p className="reviewNote">Собираю карточки…</p>
  else if (r.phase === 'finishing') body = <p className="reviewNote">Подвожу итог…</p>
  else if (r.phase === 'error') body = <Message text="Не загрузилось. Проверь сеть и попробуй ещё раз." onClose={onClose} />
  else if (r.phase === 'empty') body = <Message title="На сегодня всё ✓" text="Слова для повторения появятся, когда подойдёт их срок." onClose={onClose} />
  else if (r.phase === 'intro') {
    body = (
      <div className="reviewCenter">
        <p className="reviewTeacherName">{r.info.teacher?.name || 'Учитель'}</p>
        <p className="reviewTeacherLine">{introLine({ words: r.info.words, cards: r.info.cards, memory: r.info.memory })}</p>
        <button className="reviewBtn reviewBtn--main" onClick={r.start}>Начать</button>
      </div>
    )
  } else if (r.phase === 'run' && item) {
    body = (
      <ReviewTurn
        key={`${item.key}@${r.session.index}`}
        session={r.session}
        item={item}
        phrase={r.info.decks.get(item.word)?.phrase ?? ''}
        teacher={r.info.teacher}
        onAnswer={r.answer}
        onNoAudio={r.skipAudio}
        onClose={onClose}
      />
    )
  } else if (r.phase === 'done') {
    body = <ReviewSummary results={r.results} finish={r.finish} words={r.info.words} onClose={onClose} />
  }

  return createPortal(
    <div className="reviewScreen" role="dialog" aria-label="Повторение">{body}</div>,
    document.body,
  )
}
