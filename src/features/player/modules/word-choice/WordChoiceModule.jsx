import PlayerBubble from '../../PlayerBubble.jsx'
import BurstConfetti from '../../../../shared/ui/BurstConfetti.jsx'
import { chatFadeHeight } from '../../chatFadeHeight.js'

// Справа в чате: сначала пузырь с выбранным вариантом (только если у ноды
// включена галочка «Отправлять выбранное в чат» — тогда приходит pickText),
// следом — текст реакции на верно/неверно. Сердечко XP вешается на последний
// пузырь ряда: на реакцию, а если её текст пуст — на выбранное.
export default function WordChoiceModule({ wordChoiceState }) {
  if (!wordChoiceState) return null
  const { pickText, text, result } = wordChoiceState
  const isCorrect = result === 'correct'
  // Раннего выхода «нет пузырей — нет модуля» здесь больше НЕТ. Он забирал с
  // собой и салют: pickText приходит только с галочкой «отправлять выбранное
  // в чат», text — только если заполнена реакция на верный ответ. Когда автор
  // не заполнил ни то, ни другое (а так задумано в коротких тренировках),
  // верный ответ оставался вообще без праздника, хотя XP за него начислялся.
  // Теперь пузыри и салют независимы: пузырей может не быть, салют есть.
  if (!pickText && !text && !isCorrect) return null
  const mod = isCorrect ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'

  return (
    <>
      {/* Салют на верном — тот же, что на новом уровне, только короче и реже
          (Confetti.jsx). Рендерится один раз на весь модуль: пузырей с ответом
          может быть два (выбор и реплика), а праздник один */}
      {isCorrect && (
        <BurstConfetti count={30} size={4} bottomInset={chatFadeHeight()} zIndex={60} portalTo=".lessonPlayer" />
      )}
      {pickText && (
        <div className="playerMsgRow playerMsgRowRight">
          <div className="reactionBubbleWrap">
            {/* --pick: маркер для PlayerFeed — этот пузырь молчит, звук уже
                дал сам тап по варианту (answer-correct / answer-wrong).
                Цвет верно/неверно вешается на него же: раньше красилась
                только реплика responseCorrect, а её больше не пишут (она
                рисуется справа и звучала как ответ ученика самому себе) —
                и выбор приходил в чат всегда серым. Результат прилетает
                на 700 мс позже самого выбора, поэтому пузырь появляется
                нейтральным и доцвечивается — переход задан в CSS */}
            <PlayerBubble className={`playerMsgBubble playerMsgBubble--response playerMsgBubble--pick${result ? mod : ''}`}>
              {pickText}
            </PlayerBubble>
          </div>
        </div>
      )}
      {text && (
        <div className="playerMsgRow playerMsgRowRight">
          <div className="reactionBubbleWrap">
            <PlayerBubble className={`playerMsgBubble playerMsgBubble--response${mod}`}>
              {text}
            </PlayerBubble>
          </div>
        </div>
      )}
    </>
  )
}
