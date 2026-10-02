import { useState, useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import LessonPlayer from '../player/LessonPlayer.jsx'
import ReviewHeader from './ReviewHeader.jsx'
import ReviewProgress from './ReviewProgress.jsx'
import { cardHasAudio } from './reviewSession.js'
import { useSwipeNext } from './useSwipeNext.js'
import NoAudioButton from './NoAudioButton.jsx'
import WaitingDots from '../player/waiting/WaitingDots.jsx'

// Плашка итога ответа. Без «ошибки» и «мимо»: слово не потеряно, мы просто
// вернёмся к нему. Вторая ошибка — показать слово: само слово сессии (плеер
// верный вариант в чат не выводит, у «выбери слово» его может не быть в переписке)
function verdictOf(result, { attempt, word, kind }) {
  if (kind === 'phrase') {
    return result === 'correct'
      ? { kind: 'ok', text: 'Отлично — фраза собрана и закреплена ✨' }
      : { kind: 'bad', text: 'Почти! Вернёмся к фразе в другой раз' }
  }
  if (result === 'correct') return { kind: 'ok', text: 'Верно!' }
  if (attempt === 1) return { kind: 'bad', text: 'Ничего страшного — мы ещё вернёмся к этому слову' }
  return { kind: 'bad', text: `Вернёмся к слову «${word}» завтра` }
}

// Одна карточка сессии: кусочек чата (1–3 ноды) играет тот же LessonPlayer,
// что и урок, — в рамке .reviewCardFrame (transform делает её containing
// block для fixed-слоёв плеера: панели ответа ложатся внутрь карточки).
// Режим onFinishStats: ни XP, ни звёзд, ни экрана итогов, ни записи в анализ
// урока. После ответа карточка «переворачивается» — плашка с итогом; дальше —
// «Далее», смахивание влево — карточки или подсказки под ней (useSwipeNext) или Enter/← на клавиатуре.
// «Не могу слушать» — только на карточке со звуком (NoAudioButton). Монтируется с key карточки — состояние ответа живёт ровно одну карточку.
// Подвал (.reviewFoot) — панель действий фиксированной высоты (место под «Далее» / «смахни…» /
// «Не могу слушать» занято всегда, карточка при ответе не двигается) и тонкий прогресс под ней.
export default function ReviewTurn({ session, item, phrase, title = '', teacher, initialBlobMap, typingMs = 0, hold = false, onAnswer, onNoAudio, onClose }) {
  const [answered, setAnswered] = useState(null) // { result, timeMs }
  // Перед заданием — точки «печатает» (как в уроке): минимум typingMs, а пока hold (первая карточка
  // греет медиа) — дольше; плеер карточки монтируется, когда точки уходят
  const [typedEnough, setTypedEnough] = useState(typingMs === 0)
  useEffect(() => {
    if (typingMs === 0) return undefined
    const t = setTimeout(() => setTypedEnough(true), typingMs)
    return () => clearTimeout(t)
  }, [typingMs])
  const typing = !typedEnough || hold
  const sentRef = useRef(false)
  const verdict = answered && verdictOf(answered.result, item)

  // Ответ уходит ровно один раз, чем бы ни нажали (кнопка, жест, клавиша)
  function send(res) {
    if (sentRef.current) return
    sentRef.current = true
    onAnswer(res)
  }
  const next = () => answered && send(answered)
  const [cardRef, hintRef] = useSwipeNext(!!answered, next)

  useEffect(() => {
    if (!answered) return
    const onKey = e => {
      if (e.target?.closest?.('button, input, textarea')) return // у кнопки Enter — её собственный клик
      if (e.key === 'Enter' || e.key === 'ArrowLeft') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // без зависимостей: next читает свежий answered

  return (
    <>
      <ReviewHeader phrase={phrase} title={title} word={item.word} revealed={!!answered} onClose={onClose} />
      <div className={answered ? 'reviewCard reviewCard--answered' : 'reviewCard'} ref={cardRef}>
        <div className="reviewCardFrame">
          {!typing && (
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
          )}
          <WaitingDots visible={typing} />
        </div>
        {verdict && (
          <div className={`reviewVerdict reviewVerdict--${verdict.kind}`} role="status">{verdict.text}</div>
        )}
      </div>
      <div className="reviewFoot">
        <div className="reviewActions">
          {answered && (
            <>
              {/* Кнопка — там, где есть мышь; на касании — надпись (она же кнопка для
                  тех, кто не смахивает). Появляется только после ответа, плавно */}
              <button className="reviewBtn reviewBtn--main reviewNext" onClick={next}>Далее</button>
              <button className="reviewSwipeHint" aria-label="Далее" onClick={next} ref={hintRef}>
                <ArrowLeft className="reviewSwipeArrow" aria-hidden="true" />
                <span className="reviewSwipeHintText">
                  смахни карточку влево
                  <span className="reviewSwipeShine" aria-hidden="true"><span>смахни карточку влево</span></span>
                </span>
              </button>
            </>
          )}
          {/* «Не могу слушать» стоит справа и не исчезает: после ответа тускнеет и не нажимается */}
          {cardHasAudio(item.card) && <NoAudioButton onSkip={onNoAudio} disabled={!!answered} />}
        </div>
        <ReviewProgress session={session} />
      </div>
    </>
  )
}
