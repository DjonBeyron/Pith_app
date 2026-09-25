import StrengthDots from '../../shared/ui/StrengthDots.jsx'
import { dueLabel } from './learnView.js'

// Шторка слова из карты памяти: сила и срок, «Пройти урок целиком» и
// «Повторить сейчас» (вне расписания — удобство Pro; шаг от раннего повтора
// не растёт, ошибка — снижает: так договорились в концепции)
export default function LearnWordSheet({ word, phrase, today, isPro, onLesson, onReview, onWantPro, onClose }) {
  const canReview = !!word.step && word.hasDeck
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="lrSheet" role="dialog" aria-label={`Слово ${word.word}`} onClick={e => e.stopPropagation()}>
        <p className="lrSheetWord">{word.word}</p>
        <p className="lrSheetPhrase">{phrase.title}</p>
        {word.step ? (
          <div className="lrSheetInfo">
            <StrengthDots step={word.step} />
            <span>{word.hasDeck ? `повтор ${dueLabel(word.due, today)}` : 'повторение скоро — карточек пока нет'}</span>
          </div>
        ) : <p className="lrSheetPhrase">ещё не пройдено</p>}
        <button className="lrBtn lrBtnMain" onClick={onLesson}>Пройти урок целиком</button>
        {canReview && (
          <button className="lrBtn" onClick={isPro ? onReview : onWantPro}>
            Повторить сейчас{isPro ? '' : ' · Pro'}
          </button>
        )}
        <button className="lrBtn lrBtnGhost" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}
