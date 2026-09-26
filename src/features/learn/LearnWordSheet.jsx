import { LEVELS, levelOf } from './memoryLadder.js'
import { dueLabel } from './learnView.js'

// Шторка слова «Моей памяти»: ступень и срок, «Пройти урок целиком» (если
// слово есть во фразе) и «Повторить сейчас» (вне расписания — удобство Pro;
// шаг от раннего повтора не растёт, ошибка — снижает: так договорились в
// концепции). perm — слово из постоянной памяти
export default function LearnWordSheet({ word, perm, today, isPro, onLesson, onReview, onWantPro, onClose }) {
  const lvl = levelOf(word.step)
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="lrSheet" role="dialog" aria-label={`Слово ${word.word}`} onClick={e => e.stopPropagation()}>
        <p className="lrSheetWord">{word.word}</p>
        {word.phrase && <p className="lrSheetPhrase">{word.phrase}</p>}
        <div className="lrSheetInfo">
          <span className={perm ? 'lrSheetLevel lrSheetLevel--Perm' : `lrSheetLevel lrSheetLevel--${lvl}`}>
            {perm ? 'Постоянная память' : LEVELS[lvl - 1].name}
          </span>
          <span>{word.hasDeck ? `повтор ${dueLabel(word.due, today)}` : 'повторение скоро — карточек пока нет'}</span>
        </div>
        {word.lessonId && <button className="lrBtn lrBtnMain" onClick={onLesson}>Пройти урок целиком</button>}
        {word.hasDeck && (
          <button className="lrBtn" onClick={isPro ? onReview : onWantPro}>
            Повторить сейчас{isPro ? '' : ' · Pro'}
          </button>
        )}
        <button className="lrBtn lrBtnGhost" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
