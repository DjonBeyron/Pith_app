import { wordLevel, LEVEL_COUNT } from './memoryLadder.js'

// Окно слова «Моей памяти» (тап по слову). Сверху слово и откуда оно пришло —
// урок-слово и фраза (модуль); ниже — уровень памяти: сколько уровней из
// четырёх пройдено (полоска в цвет уровня) и что это значит, то есть насколько
// слово помнится. Срока повтора здесь нет — только уровень. Кнопки: «Пройти
// урок целиком» (если слово есть во фразе) и «Повторить сейчас» (вне
// расписания — удобство Pro; шаг от раннего повтора не растёт, ошибка —
// снижает: так договорились в концепции). perm — слово постоянной памяти
// (пятиугольник). Появляется «пружинкой» — общая анимация шторок вкладки
// (pop-spring.css)
export default function LearnWordSheet({ word, perm, isPro, onLesson, onReview, onWantPro, onClose }) {
  const level = wordLevel(word.step, perm)
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="lrSheet" role="dialog" aria-label={`Слово ${word.word}`} onClick={e => e.stopPropagation()}>
        <p className="lrSheetWord">{word.word}</p>
        {word.lessonId && (
          <p className="lrSheetPhrase memSheetFrom">
            Из урока «{word.lessonTitle || word.word}»{word.phrase && <> · фраза «{word.phrase}»</>}
          </p>
        )}
        <div className={`memSheetLevel memSheetLevel--${perm ? 'Perm' : level.n}`}>
          <div className="memSheetMeter" role="img" aria-label={`Уровень ${level.n} из ${LEVEL_COUNT}`}>
            {Array.from({ length: LEVEL_COUNT }, (_, i) => <i key={i} className={i < level.n ? 'memSheetSeg memSheetSegOn' : 'memSheetSeg'} />)}
          </div>
          <p className="memSheetLevelHead">
            <b>{level.name}</b>
            <span>Уровень {level.n} из {LEVEL_COUNT}</span>
          </p>
          <p className="memSheetLevelText">{level.remember}</p>
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
