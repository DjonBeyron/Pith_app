import BackButton from '../../shared/ui/BackButton.jsx'
import { splitByWord } from './reviewSession.js'

// Шапка сессии повторения: слева «назад» (как везде в приложении), по центру —
// фраза слова под спойлером (слово закрыто шариками, после ответа проявляется
// подсвеченным; вместо фразы — title) и под ней тонкая полоска прогресса: одна
// капсула на карточку очереди, возврат ошибки добавляет капсулу.
export default function ReviewHeader({ session, phrase, title, word, revealed, onClose }) {
  const { queue, index, events } = session
  const capsule = i => {
    if (i === index) return 'reviewCapsule reviewCapsule--now'
    if (i > index) return 'reviewCapsule'
    return events[i]?.result === 'wrong' ? 'reviewCapsule reviewCapsule--bad' : 'reviewCapsule reviewCapsule--ok'
  }
  return (
    <div className="reviewHead">
      <BackButton onClick={onClose} label="Назад" className="reviewBack" />
      <div className="reviewHeadText">
        {phrase ? (
          <p className="reviewPhrase">
            {splitByWord(phrase, word).map((p, i) => (
              p.hit
                ? <span key={i} className={revealed ? 'reviewPhraseWord' : 'reviewPhraseHidden'}>
                    {revealed ? p.text : '●'.repeat(p.text.length)}
                  </span>
                : <span key={i}>{p.text}</span>
            ))}
          </p>
        ) : title && <p className="reviewTitle">{title}</p>}
        <div className="reviewCapsules" aria-label={`Карточка ${Math.min(index + 1, queue.length)} из ${queue.length}`}>
          {queue.map((q, i) => <span key={q.key} className={capsule(i)} />)}
        </div>
      </div>
    </div>
  )
}
