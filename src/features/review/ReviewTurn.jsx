import { useState, useEffect, useRef } from 'react'
import LessonPlayer from '../player/LessonPlayer.jsx'
import ReviewHeader from './ReviewHeader.jsx'
import { cardHasAudio } from './reviewSession.js'
import { useSwipeNext } from './useSwipeNext.js'

// Вторая ошибка — показать ответ: само слово сессии (плеер верный вариант
// в чат не выводит, у «выбери слово» его может не быть в переписке)
function verdictOf(result, { attempt, word, kind }) {
  if (kind === 'phrase') {
    return result === 'correct'
      ? { kind: 'ok', text: 'Фраза твоя — закреплена ✨' }
      : { kind: 'bad', text: 'Почти! Вернёмся к фразе в другой раз' }
  }
  if (result === 'correct') return { kind: 'ok', text: 'Верно!' }
  if (attempt === 1) return { kind: 'bad', text: 'Ошибка — это слово вернётся в конце сессии' }
  return { kind: 'bad', text: `Снова мимо. Запомни: ${word} — повторим завтра` }
}

// Одна карточка сессии: кусочек чата (1–3 ноды) играет тот же LessonPlayer,
// что и урок, — в рамке .reviewCardFrame (transform делает её containing
// block для fixed-слоёв плеера: панели ответа ложатся внутрь карточки).
// Режим onFinishStats: ни XP, ни звёзд, ни экрана итогов, ни записи в анализ
// урока. После ответа карточка «переворачивается» — плашка с итогом; дальше —
// «Далее», смахивание вверх/вправо (useSwipeNext) или Enter/→ на клавиатуре.
// Монтируется с key карточки — состояние ответа живёт ровно одну карточку.
export default function ReviewTurn({ session, item, phrase, teacher, initialBlobMap, onAnswer, onNoAudio, onClose }) {
  const [answered, setAnswered] = useState(null) // { result, timeMs }
  const sentRef = useRef(false)
  const verdict = answered && verdictOf(answered.result, item)
  const audioAhead = session.queue.slice(session.index).some(q => cardHasAudio(q.card))

  // Ответ уходит ровно один раз, чем бы ни нажали (кнопка, жест, клавиша)
  function send(res) {
    if (sentRef.current) return
    sentRef.current = true
    onAnswer(res)
  }
  const next = () => answered && send(answered)
  const swipe = useSwipeNext(!!answered, next)

  useEffect(() => {
    if (!answered) return
    const onKey = e => {
      if (e.target?.closest?.('button, input, textarea')) return // у кнопки Enter — её собственный клик
      if (e.key === 'Enter' || e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // без зависимостей: next читает свежий answered

  return (
    <>
      <ReviewHeader session={session} phrase={phrase} word={item.word} revealed={!!answered} onClose={onClose} />
      <div className={answered ? 'reviewCard reviewCard--answered' : 'reviewCard'} style={swipe.style} {...swipe.handlers}>
        <div className="reviewCardFrame">
          <LessonPlayer
            nodes={item.card.nodes}
            teacherName={teacher?.name}
            teacherLogo={teacher?.logo}
            teacherLogoCrop={teacher?.crop}
            initialBlobMap={initialBlobMap}
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
          ? <button className="reviewBtn reviewBtn--main" onClick={next}>Далее</button>
          : <>
              {item.attempt === 1 && (
                <button className="reviewBtn" onClick={() => send({ result: 'know' })}>Знаю</button>
              )}
              {audioAhead && <button className="reviewBtn" onClick={onNoAudio}>Не могу слушать</button>}
            </>}
      </div>
      {answered && <p className="reviewSwipeHint">смахни вверх или вправо</p>}
    </>
  )
}
