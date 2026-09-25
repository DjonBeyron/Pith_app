import { useState } from 'react'
import LessonPlayer from '../player/LessonPlayer.jsx'
import ReviewHeader from './ReviewHeader.jsx'
import { cardHasAudio } from './reviewSession.js'

// Вторая ошибка — показать ответ: само слово сессии (плеер верный вариант
// в чат не выводит, у «выбери слово» его может не быть в переписке)
function verdictOf(result, { attempt, word }) {
  if (result === 'correct') return { kind: 'ok', text: 'Верно!' }
  if (attempt === 1) return { kind: 'bad', text: 'Ошибка — это слово вернётся в конце сессии' }
  return { kind: 'bad', text: `Снова мимо. Запомни: ${word} — повторим завтра` }
}

// Одна карточка сессии: кусочек чата (1–3 ноды) играет тот же LessonPlayer,
// что и урок, — в рамке .reviewCardFrame (transform делает её containing
// block для fixed-слоёв плеера: панели ответа ложатся внутрь карточки).
// Режим onFinishStats: ни XP, ни звёзд, ни экрана итогов, ни записи в анализ
// урока. После ответа карточка «переворачивается» — плашка с итогом и «Далее».
// Монтируется с key карточки — состояние ответа живёт ровно одну карточку.
export default function ReviewTurn({ session, item, phrase, teacher, onAnswer, onNoAudio, onClose }) {
  const [answered, setAnswered] = useState(null) // { result, timeMs }
  const verdict = answered && verdictOf(answered.result, item)
  const audioAhead = session.queue.slice(session.index).some(q => cardHasAudio(q.card))

  return (
    <>
      <ReviewHeader session={session} phrase={phrase} word={item.word} revealed={!!answered} onClose={onClose} />
      <div className={answered ? 'reviewCard reviewCard--answered' : 'reviewCard'}>
        <div className="reviewCardFrame">
          <LessonPlayer
            nodes={item.card.nodes}
            teacherName={teacher?.name}
            teacherLogo={teacher?.logo}
            teacherLogoCrop={teacher?.crop}
            recordStats={false}
            onFinishStats={({ wrong, timeMs }) => setAnswered({ result: wrong > 0 ? 'wrong' : 'correct', timeMs })}
            onSummaryClose={() => {}}
            onClose={onClose}
          />
        </div>
        {verdict && (
          <div className={`reviewVerdict reviewVerdict--${verdict.kind}`} role="status">{verdict.text}</div>
        )}
      </div>
      <div className="reviewActions">
        {answered
          ? <button className="reviewBtn reviewBtn--main" onClick={() => onAnswer(answered)}>Далее</button>
          : <>
              {item.attempt === 1 && (
                <button className="reviewBtn" onClick={() => onAnswer({ result: 'know' })}>Знаю</button>
              )}
              {audioAhead && <button className="reviewBtn" onClick={onNoAudio}>Не могу слушать</button>}
            </>}
      </div>
    </>
  )
}
