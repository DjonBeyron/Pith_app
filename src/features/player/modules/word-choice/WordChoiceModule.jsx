import PlayerBubble from '../../PlayerBubble.jsx'

// Справа в чате: сначала пузырь с выбранным вариантом (только если у ноды
// включена галочка «Отправлять выбранное в чат» — тогда приходит pickText),
// следом — текст реакции на верно/неверно. Сердечко XP вешается на последний
// пузырь ряда: на реакцию, а если её текст пуст — на выбранное.
export default function WordChoiceModule({ wordChoiceState }) {
  if (!wordChoiceState) return null
  const { pickText, text, result } = wordChoiceState
  if (!pickText && !text) return null

  const isCorrect = result === 'correct'
  const mod = isCorrect ? ' playerMsgBubble--responseOk' : ' playerMsgBubble--responseErr'

  return (
    <>
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
