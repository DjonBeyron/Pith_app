import { splitByWord } from './reviewSession.js'

// Шапка сессии повторения: капсулы прогресса (одна на карточку очереди —
// возврат ошибки добавляет капсулу) и фраза слова под спойлером: слово
// закрыто шариками, после ответа проявляется подсвеченным.
export default function ReviewHeader({ session, phrase, word, revealed, onClose }) {
  const { queue, index, events } = session
  const capsule = i => {
    if (i === index) return 'reviewCapsule reviewCapsule--now'
    if (i > index) return 'reviewCapsule'
    return events[i]?.result === 'wrong' ? 'reviewCapsule reviewCapsule--bad' : 'reviewCapsule reviewCapsule--ok'
  }
  return (
    <div className="reviewHead">
      <div className="reviewHeadRow">
        <div className="reviewCapsules" aria-label={`Карточка ${Math.min(index + 1, queue.length)} из ${queue.length}`}>
          {queue.map((q, i) => <span key={q.key} className={capsule(i)} />)}
        </div>
        <button className="reviewClose" aria-label="Закрыть повторение" onClick={onClose}>✕</button>
      </div>
      {phrase && (
        <p className="reviewPhrase">
          {splitByWord(phrase, word).map((p, i) => (
            p.hit
              ? <span key={i} className={revealed ? 'reviewPhraseWord' : 'reviewPhraseHidden'}>
                  {revealed ? p.text : '●'.repeat(p.text.length)}
                </span>
              : <span key={i}>{p.text}</span>
          ))}
        </p>
      )}
    </div>
  )
}
